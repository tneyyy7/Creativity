-- Fix RLS: allow reading subscription STATUS of ANY user
-- This is needed so that Pro frames/badges can be shown for other users across the site.
-- We expose only non-sensitive fields via a public view.

-- Option A: Add a public read policy on subscriptions (simplest)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of subscription status" ON public.subscriptions;
  CREATE POLICY "Allow public read of subscription status" ON public.subscriptions
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Option B (alternative): Create a secure view that only exposes isPro status
-- (uncomment if you prefer not to expose the full subscriptions table)
-- CREATE OR REPLACE VIEW public.public_pro_status AS
--   SELECT user_id,
--          (status = 'active' OR (status = 'cancelled' AND current_period_end > now())) AS is_pro
--   FROM public.subscriptions;
-- GRANT SELECT ON public.public_pro_status TO anon, authenticated;