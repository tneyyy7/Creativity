-- ==========================================
-- Wire post Boost into the For You ranking.
-- Adds a logarithmic boost bonus (partial stacking) to the existing score:
--   bonus = BOOST_WEIGHT * ln(1 + active_boost_count)
-- BOOST_WEIGHT = 3.0 — comparable to the followed-tag bonus (2.0), enough to lift a
-- post ~a page, not enough to dominate relevance. Tune here if needed.
-- Only boosts from users whose Pro is still active count (checked live), so a lapsed
-- Pro's boosts stop ranking immediately without any cron.
-- ==========================================

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
    -- Base score: engagement decayed by age (Hacker-News style)
    (
      (CASE WHEN p.category = ANY(p_interests) THEN 1.5 ELSE 1.0 END) *
      (COALESCE(p.likes_count, 0) * 2.0 + COALESCE(p.comments_count, 0) * 3.0 + 1.0)
      / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5)
    )
    -- Followed-tag bonus
    + (CASE WHEN bool_or(tf.tag_name IS NOT NULL) THEN 2.0 ELSE 0 END)
    -- Boost bonus (logarithmic partial stacking; only counts boosts from still-Pro users)
    + 3.0 * ln(1 + COALESCE((
        SELECT count(*) FROM public.post_boosts pb
        JOIN public.subscriptions s ON s.user_id = pb.booster_id
        WHERE pb.painting_id = p.id AND pb.active AND pb.expires_at > now()
          AND (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now()))
      ), 0)) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
