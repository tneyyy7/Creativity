-- ==========================================
-- Sprint 1.2 — Pinned posts + link-in-bio
--
-- 1) paintings.is_pinned: lets an author pin up to 3 of their works to the top
--    of their profile (portfolio = portfolio). The "max 3" rule is enforced in
--    the client API (togglePinPainting) — kept out of the DB to avoid a trigger
--    for a soft product constraint. Pinning lives on `paintings` so it inherits
--    the existing "owner can update own row" RLS — no extra policy needed.
--
-- 2) profiles.social_links: a small JSON map of external profiles for the
--    link-in-bio icon row (e.g. {"instagram":"https://...","x":"...",
--    "tiktok":"...","youtube":"..."}). Lives on `profiles` so it inherits the
--    owner-update RLS and is publicly readable like the rest of the profile.
-- ==========================================

ALTER TABLE public.paintings
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.paintings.is_pinned IS
  'Author pinned this work to the top of their profile. Max 3 per user, enforced client-side in togglePinPainting.';

-- Partial index: pinned works per author is a tiny, hot lookup on profile load.
CREATE INDEX IF NOT EXISTS paintings_pinned_idx
  ON public.paintings (user_id)
  WHERE is_pinned;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.social_links IS
  'Link-in-bio external profiles: {"instagram":url,"x":url,"tiktok":url,"youtube":url}. Rendered as an icon row on the profile.';
