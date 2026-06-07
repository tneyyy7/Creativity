-- ==========================================
-- Pro feature: profile cover photo (header background)
-- Adds a cover_url column to pro_profile_settings.
-- The table already exists with RLS:
--   - public read (USING true)
--   - insert/update restricted to Pro users (is_user_pro)
-- so no new policies are required — cover_url inherits them.
-- ==========================================

ALTER TABLE public.pro_profile_settings
  ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.pro_profile_settings.cover_url IS
  'Pro-only profile header background image. Recommended 1600x400 (4:1). Stored in the "paintings" bucket under <user_id>/cover/.';
