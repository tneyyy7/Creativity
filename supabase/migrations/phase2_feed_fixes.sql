-- ============================================================================
-- Phase 2 feed fixes — APPLY IN SUPABASE SQL EDITOR
-- ----------------------------------------------------------------------------
-- Both functions previously joined `tag_follows` on a non-existent column
-- `painting_tags.name`. painting_tags is a join table (painting_id, tag_id); the
-- tag name lives in the `tags` table. These CREATE OR REPLACE statements are
-- idempotent and fix the join + add followed-tag boosting to the personalized
-- For You feed (roadmap 2.5).
-- ============================================================================

-- 1. Personalized For You feed (the one the client actually calls):
--    interest-category boost + followed-tag boost.
CREATE OR REPLACE FUNCTION get_for_you_feed_personalized(
  p_user_id UUID,
  p_interests TEXT[],
  p_limit INT,
  p_offset INT,
  p_blocked_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS SETOF paintings
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM paintings p
  LEFT JOIN painting_tags pt ON pt.painting_id = p.id
  LEFT JOIN tags t ON t.id = pt.tag_id
  LEFT JOIN tag_follows tf ON tf.tag_name = t.name AND tf.user_id = p_user_id
  WHERE p.is_finished = true
    AND (array_length(p_blocked_ids, 1) IS NULL OR NOT (p.user_id = ANY(p_blocked_ids)))
  GROUP BY p.id
  ORDER BY
    (
      (CASE WHEN p.category = ANY(p_interests) THEN 1.5 ELSE 1.0 END) *
      (COALESCE(p.likes_count, 0) * 2.0 + COALESCE(p.comments_count, 0) * 3.0 + 1.0)
      / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5)
    )
    + (CASE WHEN bool_or(tf.tag_name IS NOT NULL) THEN 2.0 ELSE 0 END) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 2. Non-personalized fallback feed (fixed join through `tags`).
CREATE OR REPLACE FUNCTION get_for_you_feed(
  p_user_id UUID,
  p_limit INT,
  p_offset INT,
  p_blocked_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS SETOF paintings
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM paintings p
  LEFT JOIN painting_tags pt ON pt.painting_id = p.id
  LEFT JOIN tags t ON t.id = pt.tag_id
  LEFT JOIN tag_follows tf ON tf.tag_name = t.name AND tf.user_id = p_user_id
  WHERE p.is_finished = true
    AND (array_length(p_blocked_ids, 1) IS NULL OR NOT (p.user_id = ANY(p_blocked_ids)))
  GROUP BY p.id
  ORDER BY
    (
      ((COALESCE(p.likes_count, 0) * 2.0 + COALESCE(p.comments_count, 0) * 3.0 + 1.0)
      / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5))
      + COALESCE(SUM(CASE WHEN tf.tag_name IS NOT NULL THEN 2.0 ELSE 0 END), 0)
    ) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
