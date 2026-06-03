-- Per-user chat pins and hides. Both mirror chat_mutes: a row is private to the
-- acting user and one-directional. For direct chats `chat_id` is the other
-- person's profile id; for group chats it is the group's id.

-- Pinned chats float to the top of the user's conversation list.
create table if not exists public.chat_pins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chat_id    uuid not null,
  is_group   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.chat_pins enable row level security;

drop policy if exists chat_pins_select on public.chat_pins;
create policy chat_pins_select on public.chat_pins
  for select using (user_id = auth.uid());

drop policy if exists chat_pins_insert on public.chat_pins;
create policy chat_pins_insert on public.chat_pins
  for insert with check (user_id = auth.uid());

drop policy if exists chat_pins_update on public.chat_pins;
create policy chat_pins_update on public.chat_pins
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_pins_delete on public.chat_pins;
create policy chat_pins_delete on public.chat_pins
  for delete using (user_id = auth.uid());

create index if not exists chat_pins_user_idx on public.chat_pins (user_id);


-- "Deleting" a chat just hides it from the user's list. It reappears
-- automatically once a message newer than `hidden_at` arrives, so no message
-- data is ever destroyed and the other participant is unaffected.
create table if not exists public.chat_hides (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chat_id    uuid not null,
  is_group   boolean not null default false,
  hidden_at  timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.chat_hides enable row level security;

drop policy if exists chat_hides_select on public.chat_hides;
create policy chat_hides_select on public.chat_hides
  for select using (user_id = auth.uid());

drop policy if exists chat_hides_insert on public.chat_hides;
create policy chat_hides_insert on public.chat_hides
  for insert with check (user_id = auth.uid());

drop policy if exists chat_hides_update on public.chat_hides;
create policy chat_hides_update on public.chat_hides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_hides_delete on public.chat_hides;
create policy chat_hides_delete on public.chat_hides
  for delete using (user_id = auth.uid());

create index if not exists chat_hides_user_idx on public.chat_hides (user_id);
