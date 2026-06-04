-- Story Views: синхронизация статуса "просмотрено" между устройствами одного аккаунта.
-- Запустить в Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT story_views_story_id_user_id_key UNIQUE (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS story_views_user_id_idx ON public.story_views(user_id);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to read their own story_views" ON public.story_views;
  CREATE POLICY "Allow users to read their own story_views" ON public.story_views
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to manage their own story_views" ON public.story_views;
  CREATE POLICY "Allow users to manage their own story_views" ON public.story_views
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
