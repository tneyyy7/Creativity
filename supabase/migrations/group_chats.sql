-- ============================================================================
-- Group chats: schema, RLS and realtime
-- Run this in the Supabase SQL Editor.
-- Reuses the existing `messages` table (adds a nullable group_id) so that all
-- existing message rendering (reactions, replies, custom emoji, themes) works
-- unchanged for group messages.
-- ============================================================================

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.group_chats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id     uuid not null references public.group_chats(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member',          -- 'admin' | 'member'
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members(user_id);

-- 2. Extend the shared messages table ----------------------------------------

alter table public.messages
  add column if not exists group_id uuid references public.group_chats(id) on delete cascade;

-- Group messages have no single receiver.
alter table public.messages alter column receiver_id drop not null;

create index if not exists messages_group_idx on public.messages(group_id, created_at);

-- 3. Helper to avoid RLS recursion on group_members --------------------------
-- SECURITY DEFINER so the membership check itself isn't subject to RLS.

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid
  );
$$;

create or replace function public.is_group_admin(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid and role = 'admin'
  );
$$;

-- 4. Enable RLS --------------------------------------------------------------

alter table public.group_chats   enable row level security;
alter table public.group_members enable row level security;

-- 5. group_chats policies ----------------------------------------------------

-- The creator must also be able to SELECT the row — both to read it back from
-- the INSERT ... RETURNING (insert().select()) before any members exist, and to
-- keep access if they ever leave their own group.
drop policy if exists group_chats_select on public.group_chats;
create policy group_chats_select on public.group_chats
  for select using (
    created_by = auth.uid() or public.is_group_member(id, auth.uid())
  );

drop policy if exists group_chats_insert on public.group_chats;
create policy group_chats_insert on public.group_chats
  for insert with check ( created_by = auth.uid() );

drop policy if exists group_chats_update on public.group_chats;
create policy group_chats_update on public.group_chats
  for update using ( public.is_group_admin(id, auth.uid()) );

drop policy if exists group_chats_delete on public.group_chats;
create policy group_chats_delete on public.group_chats
  for delete using ( public.is_group_admin(id, auth.uid()) );

-- 6. group_members policies --------------------------------------------------

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select using ( public.is_group_member(group_id, auth.uid()) );

-- A member can be added by an admin, OR a user can add the very first row
-- (themselves as admin) when creating a group.
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert with check (
    public.is_group_admin(group_id, auth.uid())
    or user_id = auth.uid()
  );

-- A user can update their own row (e.g. last_read_at); admins can update any.
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update using (
    user_id = auth.uid() or public.is_group_admin(group_id, auth.uid())
  );

-- Admins can remove anyone; a member can remove themselves (leave).
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete using (
    user_id = auth.uid() or public.is_group_admin(group_id, auth.uid())
  );

-- 7. messages policies for group messages ------------------------------------
-- These are ADDED alongside the existing personal-message policies. Postgres
-- combines permissive policies with OR, so direct messages keep working.

drop policy if exists messages_group_select on public.messages;
create policy messages_group_select on public.messages
  for select using (
    group_id is not null and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists messages_group_insert on public.messages;
create policy messages_group_insert on public.messages
  for insert with check (
    group_id is not null
    and sender_id = auth.uid()
    and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists messages_group_update on public.messages;
create policy messages_group_update on public.messages
  for update using (
    group_id is not null and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists messages_group_delete on public.messages;
create policy messages_group_delete on public.messages
  for delete using (
    group_id is not null
    and (sender_id = auth.uid() or public.is_group_admin(group_id, auth.uid()))
  );

-- 8. Realtime ----------------------------------------------------------------
-- `messages` is already in the supabase_realtime publication (used by DMs).
-- Add group_members so member changes propagate in realtime too.

do $$
begin
  begin
    alter publication supabase_realtime add table public.group_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_chats;
  exception when duplicate_object then null;
  end;
end $$;
