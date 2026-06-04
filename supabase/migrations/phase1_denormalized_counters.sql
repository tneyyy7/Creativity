-- Phase 1.1 — Denormalized counters for server-side sorting/pagination.
--
-- `likes_count` is already created/maintained by fix_analytics_counters.sql.
-- This migration adds the matching `comments_count` so the feed/explore queries
-- can ORDER BY popularity on the server (via .range()) without per-row count
-- aggregations. Idempotent: safe to re-run.

-- 1. Column
ALTER TABLE public.paintings
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

-- 2. Backfill from the source of truth
UPDATE public.paintings p
SET comments_count = (
  SELECT COUNT(*)
  FROM public.post_comments pc
  WHERE pc.painting_id = p.id
);

-- 3. Trigger to keep it in sync
CREATE OR REPLACE FUNCTION public.update_painting_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.paintings
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.painting_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.paintings
    SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1)
    WHERE id = OLD.painting_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_comment_change ON public.post_comments;
CREATE TRIGGER on_post_comment_change
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_painting_comments_count();

-- 4. Indexes that back the new server-side ordering of the feed/explore lists.
CREATE INDEX IF NOT EXISTS paintings_finished_created_idx
  ON public.paintings (is_finished, created_at DESC);

CREATE INDEX IF NOT EXISTS paintings_finished_likes_idx
  ON public.paintings (is_finished, likes_count DESC);

CREATE INDEX IF NOT EXISTS paintings_user_finished_created_idx
  ON public.paintings (user_id, is_finished, created_at DESC);
