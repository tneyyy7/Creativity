-- ==========================================
-- Helper for Explore "Popular": all currently-boosted painting ids.
-- Exposes only painting ids (never booster identity). Only counts boosts whose
-- booster is still Pro, so lapsed-Pro boosts drop out immediately.
-- The volume is small (scarce monthly quota, 3-day lifetime), so returning the
-- full set is cheap.
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_active_boosted_ids()
RETURNS TABLE (painting_id uuid) AS $$
  SELECT DISTINCT pb.painting_id
  FROM public.post_boosts pb
  JOIN public.subscriptions s ON s.user_id = pb.booster_id
  WHERE pb.active
    AND pb.expires_at > now()
    AND (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now()));
$$ LANGUAGE sql SECURITY DEFINER;
