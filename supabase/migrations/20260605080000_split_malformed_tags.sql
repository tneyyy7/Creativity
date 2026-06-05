-- Migration split_malformed_tags.sql
-- Исправляет баг, из-за которого несколько хештегов, введённых через пробел
-- ("#dog #slave"), сохранялись как ОДИН тег с именем "dog #slave".
-- Находит все теги, в имени которых есть пробелы или символ '#', разбивает их
-- на отдельные чистые теги, переносит связи painting_tags на правильные теги
-- и удаляет испорченный тег.

DO $$
DECLARE
  bad   RECORD;
  part  TEXT;
  clean TEXT;
  good_id UUID;
BEGIN
  FOR bad IN
    SELECT id, name FROM public.tags
    WHERE name ~ '[#[:space:]]'
  LOOP
    -- Разбиваем испорченное имя на части по пробелам и '#'
    FOR part IN
      SELECT unnest(regexp_split_to_array(bad.name, '[[:space:]#]+'))
    LOOP
      clean := lower(btrim(part));
      CONTINUE WHEN clean = '';

      -- Гарантируем существование правильного тега
      SELECT id INTO good_id FROM public.tags WHERE name = clean;
      IF good_id IS NULL THEN
        INSERT INTO public.tags (name) VALUES (clean)
        ON CONFLICT (name) DO NOTHING;
        SELECT id INTO good_id FROM public.tags WHERE name = clean;
      END IF;

      -- Переносим связи с картинами на правильный тег
      -- (ON CONFLICT защищает от дублей по (painting_id, tag_id))
      INSERT INTO public.painting_tags (painting_id, tag_id)
      SELECT painting_id, good_id
      FROM public.painting_tags
      WHERE tag_id = bad.id
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Удаляем испорченный тег (CASCADE уберёт его старые painting_tags)
    DELETE FROM public.tags WHERE id = bad.id;
  END LOOP;
END $$;
