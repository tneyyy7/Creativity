-- Phase 1.2 — Moderation & safety primitives.
--   * reports        — user-submitted reports against a post / user / comment
--   * blocked_users  — one-directional block list (blocker hides blocked)
--   * paintings.is_nsfw — sensitive-content flag for blur-on-display
-- Idempotent: safe to re-run.

-- =====================================================================
-- 1. REPORTS
-- =====================================================================
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  target_type  text not null check (target_type in ('post', 'user', 'comment')),
  target_id    uuid not null,
  reason       text not null,
  details      text,
  status       text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now()
);

alter table public.reports enable row level security;

-- A user can file reports and see the ones they filed; they cannot read others'.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select using (reporter_id = auth.uid());

-- One open report per (reporter, target) — stops accidental/spam duplicates.
create unique index if not exists reports_unique_open
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- =====================================================================
-- 2. BLOCKED USERS
-- =====================================================================
create table if not exists public.blocked_users (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists blocked_users_select on public.blocked_users;
create policy blocked_users_select on public.blocked_users
  for select using (blocker_id = auth.uid());

drop policy if exists blocked_users_insert on public.blocked_users;
create policy blocked_users_insert on public.blocked_users
  for insert with check (blocker_id = auth.uid());

drop policy if exists blocked_users_delete on public.blocked_users;
create policy blocked_users_delete on public.blocked_users
  for delete using (blocker_id = auth.uid());

create index if not exists blocked_users_blocker_idx on public.blocked_users (blocker_id);

-- =====================================================================
-- 3. NSFW / sensitive-content flag on works
-- =====================================================================
alter table public.paintings
  add column if not exists is_nsfw boolean not null default false;
