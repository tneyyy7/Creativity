-- ==========================================
-- Free feature: customizable profile banner gradient
-- Adds a banner_gradient column to the profiles table.
-- Unlike the Pro cover photo (pro_profile_settings.cover_url, Pro-only),
-- the banner gradient is available to EVERY user. It lives on `profiles`
-- so it inherits the existing "owner can update own row" RLS — no Pro gate.
--
-- Stored value is a preset id (e.g. 'aurora', 'sunset'); the CSS gradient is
-- resolved on the client (see src/lib/bannerGradients.js). NULL/empty falls
-- back to the default preset.
-- ==========================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_gradient text;

COMMENT ON COLUMN public.profiles.banner_gradient IS
  'Free profile banner gradient preset id (see src/lib/bannerGradients.js). NULL = default. A Pro cover_url image, when set, takes visual priority over this.';
