-- 📊 MIGRATION TO FIX VIEW AND LIKE COUNTERS IN PAINTINGS TABLE
-- This script safely adds counters, synchronizes existing likes, 
-- configures automatic update triggers, creates painting_views log table,
-- and defines secure RPC functions.

-- 1. Add views_count and likes_count columns to public.paintings if they don't exist
ALTER TABLE public.paintings ADD COLUMN IF NOT EXISTS views_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.paintings ADD COLUMN IF NOT EXISTS likes_count integer DEFAULT 0 NOT NULL;

-- 2. Create painting_views table to log actual view events by date
CREATE TABLE IF NOT EXISTS public.painting_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on painting_views
ALTER TABLE public.painting_views ENABLE ROW LEVEL SECURITY;

-- Add RLS policy to allow public select on painting_views
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read of painting_views" ON public.painting_views;
  CREATE POLICY "Allow public read of painting_views" ON public.painting_views
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Synchronize likes_count with current likes in public.post_likes
UPDATE public.paintings p
SET likes_count = (
  SELECT COUNT(*)
  FROM public.post_likes pl
  WHERE pl.painting_id = p.id
);

-- 4. Create or replace trigger function to update likes_count automatically
CREATE OR REPLACE FUNCTION public.update_painting_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.paintings
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.painting_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.paintings
    SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
    WHERE id = OLD.painting_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on public.post_likes
DROP TRIGGER IF EXISTS on_post_like_change ON public.post_likes;
CREATE TRIGGER on_post_like_change
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_painting_likes_count();

-- 6. Create RPC function to safely increment views_count and log view event in painting_views
CREATE OR REPLACE FUNCTION public.increment_painting_views(target_painting_id uuid)
RETURNS void AS $$
BEGIN
  -- A. Increment general counter in paintings table
  UPDATE public.paintings
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = target_painting_id;

  -- B. Log individual view event with current date
  INSERT INTO public.painting_views (painting_id)
  VALUES (target_painting_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION public.increment_painting_views(uuid) TO anon, authenticated;
GRANT SELECT ON public.painting_views TO anon, authenticated;
