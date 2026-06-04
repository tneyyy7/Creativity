-- Phase 1.2b — Admin moderation panel.
--   * profiles.is_admin  — grants access to the in-app report queue
--   * profiles.is_banned — globally hides a user's works from feeds
--   * is_admin() helper  — SECURITY DEFINER, avoids RLS recursion
--   * admin RLS          — read/resolve all reports, delete any post/comment,
--                          toggle is_banned on any profile
-- Idempotent: safe to re-run.
--
-- After applying, grant yourself admin with:
--   update public.profiles set is_admin = true where id = '<your-auth-uid>';

-- =====================================================================
-- 1. Columns
-- =====================================================================
alter table public.profiles
  add column if not exists is_admin  boolean not null default false;
alter table public.profiles
  add column if not exists is_banned boolean not null default false;

-- =====================================================================
-- 2. Admin check helper (SECURITY DEFINER bypasses RLS → no recursion
--    when referenced from profiles' own policies).
-- =====================================================================
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- =====================================================================
-- 3. Reports — admins can read every report and update its status.
--    (The reporter-scoped policies from phase1_moderation.sql remain;
--     RLS policies are permissive, so these are additive.)
-- =====================================================================
drop policy if exists reports_admin_select on public.reports;
create policy reports_admin_select on public.reports
  for select using (public.is_admin(auth.uid()));

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =====================================================================
-- 4. Content takedown — admins may delete any reported painting/comment.
-- =====================================================================
drop policy if exists paintings_admin_delete on public.paintings;
create policy paintings_admin_delete on public.paintings
  for delete using (public.is_admin(auth.uid()));

drop policy if exists post_comments_admin_delete on public.post_comments;
create policy post_comments_admin_delete on public.post_comments
  for delete using (public.is_admin(auth.uid()));

-- =====================================================================
-- 5. Ban toggle — admins may update is_banned on any profile.
-- =====================================================================
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
