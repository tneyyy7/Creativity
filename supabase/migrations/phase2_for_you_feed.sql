-- Алгоритмическая лента For You (Фаза 2.1)
-- Возвращает посты, ранжированные по свежести и вовлеченности (likes, comments).
-- Использует адаптацию алгоритма Hacker News.

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
  WHERE p.is_finished = true
    -- Исключаем заблокированных авторов
    AND (array_length(p_blocked_ids, 1) IS NULL OR NOT (p.user_id = ANY(p_blocked_ids)))
  ORDER BY 
    -- Формула: (Лайки * 2 + Комменты * 3 + 1) / (Время_в_часах + 2)^1.5
    (COALESCE(p.likes_count, 0) * 2.0 + COALESCE(p.comments_count, 0) * 3.0 + 1.0) 
    / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
