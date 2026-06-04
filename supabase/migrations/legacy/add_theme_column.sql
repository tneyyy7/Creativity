-- Adds a per-user app theme preference to profiles.
-- Allowed values: 'purple' (default), 'dark', 'light', 'ocean'.
-- Safe to run multiple times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'purple';

-- Guard against invalid values written by clients.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_theme_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_theme_check
      CHECK (theme IN ('purple', 'dark', 'light', 'ocean'));
  END IF;
END $$;
