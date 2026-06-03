-- FIX: allow a group's creator to SELECT it (needed for insert().select() to
-- return the new row before any group_members rows exist). Run this once in the
-- Supabase SQL Editor if you already applied group_chats.sql.

drop policy if exists group_chats_select on public.group_chats;
create policy group_chats_select on public.group_chats
  for select using (
    created_by = auth.uid() or public.is_group_member(id, auth.uid())
  );

-- Clean up any orphaned diagnostic rows created while debugging.
delete from public.group_chats
where name in ('TEST_NORET', 'TEST_DIAG')
  and not exists (
    select 1 from public.group_members gm where gm.group_id = group_chats.id
  );
