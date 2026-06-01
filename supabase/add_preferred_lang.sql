-- Adds the column used to deliver push notifications in the user's site language.
-- Run once in the Supabase SQL editor.
alter table public.profiles
  add column if not exists preferred_lang text default 'en';
