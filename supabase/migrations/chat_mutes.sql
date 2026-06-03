-- Per-user chat mutes. A row means `user_id` has muted notifications coming
-- from `chat_id`. For direct chats `chat_id` is the other person's profile id;
-- for group chats it is the group's id. The mute is one-directional and private
-- to the muting user.

create table if not exists public.chat_mutes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chat_id    uuid not null,
  is_group   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.chat_mutes enable row level security;

-- A user can only see and manage their own mutes.
drop policy if exists chat_mutes_select on public.chat_mutes;
create policy chat_mutes_select on public.chat_mutes
  for select using (user_id = auth.uid());

drop policy if exists chat_mutes_insert on public.chat_mutes;
create policy chat_mutes_insert on public.chat_mutes
  for insert with check (user_id = auth.uid());

drop policy if exists chat_mutes_update on public.chat_mutes;
create policy chat_mutes_update on public.chat_mutes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_mutes_delete on public.chat_mutes;
create policy chat_mutes_delete on public.chat_mutes
  for delete using (user_id = auth.uid());

-- The push edge function (service role) looks up mutes by recipient to decide
-- whether to skip a notification.
create index if not exists chat_mutes_user_idx on public.chat_mutes (user_id);
