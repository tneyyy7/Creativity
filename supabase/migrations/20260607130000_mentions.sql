-- ==========================================
-- Sprint 1.3 — @mentions
--
-- Parses @nickname tokens in comments and post descriptions and inserts a
-- 'mention' notification for each mentioned user. The existing notifications →
-- DB webhook → onesignal-notify pipeline then delivers a push, so this reuses
-- the whole push channel for free.
--
-- Mirrors the existing handle_comment_notification / handle_like_notification
-- triggers: AFTER INSERT, SECURITY DEFINER, wrapped in a soft EXCEPTION block so
-- a parse failure can never roll back the user's comment/post.
--
-- The notifications.type CHECK constraint was already dropped (legacy migration),
-- so 'mention' is accepted alongside 'like'/'comment'/'boost'/etc.
-- ==========================================

-- Comments: notify everyone @mentioned in the comment body, except the author
-- themselves and the painting owner (who already gets a 'comment' notification).
CREATE OR REPLACE FUNCTION public.handle_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  v_author uuid;
  v_handle text;
  v_mentioned uuid;
BEGIN
  BEGIN
    SELECT user_id INTO v_author FROM public.paintings WHERE id = NEW.painting_id;

    FOR v_handle IN
      SELECT DISTINCT lower(m[1])
      FROM regexp_matches(COALESCE(NEW.content, ''), '@([A-Za-z0-9_]+)', 'g') AS m
    LOOP
      SELECT id INTO v_mentioned
      FROM public.profiles WHERE lower(nickname) = v_handle LIMIT 1;

      IF v_mentioned IS NOT NULL
         AND v_mentioned <> NEW.user_id
         AND (v_author IS NULL OR v_mentioned <> v_author) THEN
        INSERT INTO public.notifications (user_id, actor_id, painting_id, type, content, is_read, created_at)
        VALUES (v_mentioned, NEW.user_id, NEW.painting_id, 'mention', substring(NEW.content from 1 for 100), false, now());
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_comment_mentions failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_mentions ON public.post_comments;
CREATE TRIGGER on_comment_mentions
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_mentions();


-- Post descriptions: notify users @mentioned in the description. On UPDATE only
-- newly-added handles fire (handles already present in OLD.description are skipped)
-- so editing a post doesn't re-ping everyone.
CREATE OR REPLACE FUNCTION public.handle_painting_mentions()
RETURNS TRIGGER AS $$
DECLARE
  v_handle text;
  v_mentioned uuid;
BEGIN
  BEGIN
    IF NEW.description IS NULL OR NEW.description = '' THEN RETURN NEW; END IF;

    FOR v_handle IN
      SELECT DISTINCT lower(m[1])
      FROM regexp_matches(NEW.description, '@([A-Za-z0-9_]+)', 'g') AS m
    LOOP
      -- Skip handles that were already mentioned before this edit.
      IF TG_OP = 'UPDATE' AND OLD.description IS NOT NULL
         AND OLD.description ~* ('@' || v_handle || '(\W|$)') THEN
        CONTINUE;
      END IF;

      SELECT id INTO v_mentioned
      FROM public.profiles WHERE lower(nickname) = v_handle LIMIT 1;

      IF v_mentioned IS NOT NULL AND v_mentioned <> NEW.user_id THEN
        INSERT INTO public.notifications (user_id, actor_id, painting_id, type, content, is_read, created_at)
        VALUES (v_mentioned, NEW.user_id, NEW.painting_id, 'mention', substring(NEW.description from 1 for 100), false, now());
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_painting_mentions failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_painting_mentions ON public.paintings;
CREATE TRIGGER on_painting_mentions
  AFTER INSERT OR UPDATE OF description ON public.paintings
  FOR EACH ROW EXECUTE FUNCTION public.handle_painting_mentions();
