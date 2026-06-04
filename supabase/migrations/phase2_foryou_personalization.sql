-- Migration for For You feed personalization based on user interests

-- 1. Add interests column to profiles if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}'::TEXT[];

-- 2. Create the personalized For You feed function
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
  WHERE p.is_finished = true
    AND (array_length(p_blocked_ids, 1) IS NULL OR NOT (p.user_id = ANY(p_blocked_ids)))
  ORDER BY 
    -- Boost score of paintings in categories selected as interests (1.5x weight)
    (CASE WHEN p.category = ANY(p_interests) THEN 1.5 ELSE 1.0 END) *
    (COALESCE(p.likes_count, 0) * 2.0 + COALESCE(p.comments_count, 0) * 3.0 + 1.0) 
    / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
