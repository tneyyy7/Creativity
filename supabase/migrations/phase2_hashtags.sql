CREATE TABLE IF NOT EXISTS tag_follows (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_name)
);

-- Policy for tag_follows
ALTER TABLE tag_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tag follows"
  ON tag_follows
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read tag follows"
  ON tag_follows
  FOR SELECT
  USING (true);

-- Update get_for_you_feed to consider tag follows
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
  -- painting_tags is a join table (painting_id, tag_id); the tag name lives in `tags`.
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
