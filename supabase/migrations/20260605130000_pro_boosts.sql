-- ==========================================
-- Pro feature: post Boost
-- Pro users spend a monthly quota of boosts to push other (or their own) posts
-- higher in the For You feed and Explore "Popular" ranking.
--   - Quota: pro_monthly = 5/mo, pro_yearly = 10/mo. Unused boosts expire on refill.
--   - A boost lives for 3 days.
--   - Stacking is partial (logarithmic): score = BOOST_WEIGHT * ln(1 + active_count).
--   - Boosts from a user whose Pro has lapsed stop counting immediately
--     (ranking joins check is_user_pro(booster_id) live — no cron needed).
-- ==========================================

-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS public.boost_balance (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  available int NOT NULL DEFAULT 0,
  monthly_quota int NOT NULL DEFAULT 5,
  period_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.boost_balance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "read own boost balance" ON public.boost_balance;
  CREATE POLICY "read own boost balance" ON public.boost_balance
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.post_boosts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booster_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '3 days'
);

-- One active boost from a given user on a given post.
CREATE UNIQUE INDEX IF NOT EXISTS post_boosts_unique_active
  ON public.post_boosts (booster_id, painting_id) WHERE active;
CREATE INDEX IF NOT EXISTS post_boosts_painting_active
  ON public.post_boosts (painting_id) WHERE active;

ALTER TABLE public.post_boosts ENABLE ROW LEVEL SECURITY;

-- No direct client writes: all mutations go through SECURITY DEFINER RPCs below.
-- Reads are intentionally NOT public (booster identity is private — exposed only to the
-- post owner via get_post_boosters). A user may read their own boost rows.
DO $$
BEGIN
  DROP POLICY IF EXISTS "read own boosts" ON public.post_boosts;
  CREATE POLICY "read own boosts" ON public.post_boosts
    FOR SELECT USING (auth.uid() = booster_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------- Helpers ----------

-- Quota for a plan.
CREATE OR REPLACE FUNCTION public.boost_quota_for_user(p_user uuid)
RETURNS int AS $$
DECLARE
  v_plan text;
BEGIN
  SELECT plan INTO v_plan FROM public.subscriptions WHERE user_id = p_user;
  IF v_plan = 'pro_yearly' THEN
    RETURN 10;
  ELSIF v_plan = 'pro_monthly' THEN
    RETURN 5;
  END IF;
  RETURN 5; -- default for any other active Pro state
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get (and lazily refill) the caller's boost balance.
-- Refills to quota when a month has elapsed since period_start; unused boosts expire.
CREATE OR REPLACE FUNCTION public.get_boost_balance()
RETURNS TABLE (available int, monthly_quota int, period_end timestamptz, is_pro boolean) AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pro boolean;
  v_quota int;
  v_row public.boost_balance%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0, 0, NULL::timestamptz, false;
    RETURN;
  END IF;

  v_pro := public.is_user_pro(v_uid);
  v_quota := public.boost_quota_for_user(v_uid);

  SELECT * INTO v_row FROM public.boost_balance WHERE user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.boost_balance (user_id, available, monthly_quota, period_start)
    VALUES (v_uid, CASE WHEN v_pro THEN v_quota ELSE 0 END, v_quota, now())
    RETURNING * INTO v_row;
  ELSIF now() - v_row.period_start >= interval '1 month' THEN
    -- Lazy monthly refill.
    UPDATE public.boost_balance
      SET available = CASE WHEN v_pro THEN v_quota ELSE 0 END,
          monthly_quota = v_quota,
          period_start = now(),
          updated_at = now()
      WHERE user_id = v_uid
      RETURNING * INTO v_row;
  ELSIF v_row.monthly_quota <> v_quota THEN
    -- Plan changed mid-period: keep current available, just sync the quota label.
    UPDATE public.boost_balance SET monthly_quota = v_quota, updated_at = now()
      WHERE user_id = v_uid RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN v_pro THEN v_row.available ELSE 0 END,
    v_row.monthly_quota,
    (v_row.period_start + interval '1 month'),
    v_pro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply a boost to a painting. Spends one from balance.
-- Returns the new available count, or raises on failure.
CREATE OR REPLACE FUNCTION public.apply_boost(p_painting_id uuid)
RETURNS int AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_avail int;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_user_pro(v_uid) THEN RAISE EXCEPTION 'not_pro'; END IF;

  SELECT user_id INTO v_owner FROM public.paintings WHERE id = p_painting_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'painting_not_found'; END IF;

  -- Already boosting this post?
  IF EXISTS (SELECT 1 FROM public.post_boosts
             WHERE booster_id = v_uid AND painting_id = p_painting_id AND active) THEN
    RAISE EXCEPTION 'already_boosted';
  END IF;

  -- Ensure balance row is current, then check funds.
  PERFORM public.get_boost_balance();
  SELECT available INTO v_avail FROM public.boost_balance WHERE user_id = v_uid;
  IF v_avail IS NULL OR v_avail <= 0 THEN RAISE EXCEPTION 'no_boosts_left'; END IF;

  UPDATE public.boost_balance SET available = available - 1, updated_at = now()
    WHERE user_id = v_uid;

  INSERT INTO public.post_boosts (booster_id, painting_id)
    VALUES (v_uid, p_painting_id);

  -- Notify the post owner (skip self-boost). Trigger on notifications fires the push.
  IF v_owner <> v_uid THEN
    INSERT INTO public.notifications (user_id, actor_id, painting_id, type, is_read, created_at)
    VALUES (v_owner, v_uid, p_painting_id, 'boost', false, now());
  END IF;

  RETURN v_avail - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Move an existing active boost from one post to another (no balance change).
CREATE OR REPLACE FUNCTION public.reassign_boost(p_from_painting_id uuid, p_to_painting_id uuid)
RETURNS boolean AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_user_pro(v_uid) THEN RAISE EXCEPTION 'not_pro'; END IF;

  -- Must own an active boost on the source post.
  IF NOT EXISTS (SELECT 1 FROM public.post_boosts
                 WHERE booster_id = v_uid AND painting_id = p_from_painting_id AND active) THEN
    RAISE EXCEPTION 'source_boost_not_found';
  END IF;
  -- Can't already be boosting the target.
  IF EXISTS (SELECT 1 FROM public.post_boosts
             WHERE booster_id = v_uid AND painting_id = p_to_painting_id AND active) THEN
    RAISE EXCEPTION 'already_boosted';
  END IF;

  SELECT user_id INTO v_owner FROM public.paintings WHERE id = p_to_painting_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'painting_not_found'; END IF;

  UPDATE public.post_boosts SET active = false
    WHERE booster_id = v_uid AND painting_id = p_from_painting_id AND active;

  INSERT INTO public.post_boosts (booster_id, painting_id)
    VALUES (v_uid, p_to_painting_id);

  IF v_owner <> v_uid THEN
    INSERT INTO public.notifications (user_id, actor_id, painting_id, type, is_read, created_at)
    VALUES (v_owner, v_uid, p_to_painting_id, 'boost', false, now());
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The caller's currently active boosts (for the reassign picker).
CREATE OR REPLACE FUNCTION public.get_my_boosts()
RETURNS TABLE (painting_id uuid, title text, image_url text, expires_at timestamptz) AS $$
  SELECT pb.painting_id, p.title, p.image_url, pb.expires_at
  FROM public.post_boosts pb
  JOIN public.paintings p ON p.id = pb.painting_id
  WHERE pb.booster_id = auth.uid()
    AND pb.active
    AND pb.expires_at > now()
  ORDER BY pb.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Which of the given paintings are currently boosted (for the "Boosted" badge).
-- Returns only painting ids — never booster identity.
CREATE OR REPLACE FUNCTION public.get_boosted_painting_ids(p_ids uuid[])
RETURNS TABLE (painting_id uuid) AS $$
  SELECT DISTINCT pb.painting_id
  FROM public.post_boosts pb
  JOIN public.subscriptions s ON s.user_id = pb.booster_id
  WHERE pb.painting_id = ANY(p_ids)
    AND pb.active
    AND pb.expires_at > now()
    AND (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now()));
$$ LANGUAGE sql SECURITY DEFINER;

-- Who boosted a post — visible only to the post owner.
CREATE OR REPLACE FUNCTION public.get_post_boosters(p_painting_id uuid)
RETURNS TABLE (booster_id uuid, nickname text, avatar_url text, created_at timestamptz) AS $$
  SELECT pb.booster_id, pr.nickname, pr.avatar_url, pb.created_at
  FROM public.post_boosts pb
  JOIN public.profiles pr ON pr.id = pb.booster_id
  WHERE pb.painting_id = p_painting_id
    AND pb.active
    AND pb.expires_at > now()
    AND (SELECT user_id FROM public.paintings WHERE id = p_painting_id) = auth.uid()
  ORDER BY pb.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Deactivate a user's boosts the moment their subscription lapses.
CREATE OR REPLACE FUNCTION public.handle_subscription_boost_cleanup()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (NEW.status = 'active' OR (NEW.status = 'cancelled' AND NEW.current_period_end > now())) THEN
    UPDATE public.post_boosts SET active = false
      WHERE booster_id = NEW.user_id AND active;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_subscription_boost_cleanup ON public.subscriptions;
CREATE TRIGGER on_subscription_boost_cleanup
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_subscription_boost_cleanup();
