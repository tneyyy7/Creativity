-- Migration phase4_admin_content.sql
-- Этап 4 админ-панели: проактивное управление контентом и тегами.
--   1. Лента контента (посты/истории) с фильтрами (NSFW, автор, дата, поиск)
--      и серверной пагинацией — admin_list_content.
--   2. Переключение NSFW-флага (одиночно и пакетно) — admin_set_nsfw / admin_bulk_set_nsfw.
--   3. Bulk-удаление постов/историй. RPC возвращает storage-пути удалённых файлов,
--      чтобы клиент почистил бакет (строка в БД не удаляет файл из Storage).
--   4. Управление тегами: список с usage/followers, переименование, мерж, удаление.
--      Мерж/переименование переписывают painting_tags и tag_follows в одной транзакции.
-- Все RPC — SECURITY DEFINER с проверкой роли (минимум moderator). Идемпотентно.
-- Зависит от phase3_admin_foundation.sql (has_role, admin_actions).

-- =====================================================================
-- 1. Лента контента с фильтрами и серверной пагинацией.
--    p_type:  'post' (paintings) | 'story' (stories)
--    p_nsfw:  'all' | 'nsfw' | 'sfw'   (применяется только к постам)
--    p_author: фильтр по user_id (NULL — все)
--    p_search: ILIKE по title (посты) / caption (истории)
-- =====================================================================
create or replace function public.admin_list_content(
    p_type   text default 'post',
    p_search text default null,
    p_author uuid default null,
    p_nsfw   text default 'all',
    p_limit  int  default 24,
    p_offset int  default 0
) returns jsonb as $$
declare
    v_rows   jsonb;
    v_total  int;
    v_search text;
    v_limit  int := greatest(1, least(coalesce(p_limit, 24), 100));
    v_offset int := greatest(0, coalesce(p_offset, 0));
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_search := nullif(trim(coalesce(p_search, '')), '');

    if p_type = 'story' then
        select count(*) into v_total
        from public.stories s
        where (p_author is null or s.user_id = p_author)
          and (v_search is null or s.caption ilike '%' || v_search || '%');

        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
            select
                s.id, s.user_id, s.image_url, s.caption, s.created_at, s.expires_at,
                (s.expires_at <= now()) as is_expired,
                pr.nickname as author_nickname,
                pr.avatar_url as author_avatar
            from public.stories s
            left join public.profiles pr on pr.id = s.user_id
            where (p_author is null or s.user_id = p_author)
              and (v_search is null or s.caption ilike '%' || v_search || '%')
            order by s.created_at desc
            limit v_limit offset v_offset
        ) t;
    else
        select count(*) into v_total
        from public.paintings p
        where (p_author is null or p.user_id = p_author)
          and (v_search is null or p.title ilike '%' || v_search || '%')
          and (p_nsfw = 'all'
               or (p_nsfw = 'nsfw' and p.is_nsfw is true)
               or (p_nsfw = 'sfw'  and coalesce(p.is_nsfw, false) = false));

        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
            select
                p.id, p.user_id, p.title, p.image_url, p.is_nsfw, p.is_finished,
                p.is_ai_generated, p.likes_count, p.comments_count, p.created_at,
                pr.nickname as author_nickname,
                pr.avatar_url as author_avatar
            from public.paintings p
            left join public.profiles pr on pr.id = p.user_id
            where (p_author is null or p.user_id = p_author)
              and (v_search is null or p.title ilike '%' || v_search || '%')
              and (p_nsfw = 'all'
                   or (p_nsfw = 'nsfw' and p.is_nsfw is true)
                   or (p_nsfw = 'sfw'  and coalesce(p.is_nsfw, false) = false))
            order by p.created_at desc
            limit v_limit offset v_offset
        ) t;
    end if;

    return jsonb_build_object('total', v_total, 'items', v_rows);
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 2. Переключение NSFW-флага. Одиночное и пакетное. Только посты.
-- =====================================================================
create or replace function public.admin_set_nsfw(p_id uuid, p_value boolean)
returns boolean as $$
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    update public.paintings set is_nsfw = p_value where id = p_id;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'set_nsfw', 'post', p_id::text,
            jsonb_build_object('is_nsfw', p_value));

    return true;
end;
$$ language plpgsql security definer;

create or replace function public.admin_bulk_set_nsfw(p_ids uuid[], p_value boolean)
returns int as $$
declare
    v_count int;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;
    if p_ids is null or array_length(p_ids, 1) is null then
        return 0;
    end if;

    update public.paintings set is_nsfw = p_value where id = any(p_ids);
    get diagnostics v_count = row_count;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'bulk_set_nsfw', 'post', null,
            jsonb_build_object('is_nsfw', p_value, 'count', v_count, 'ids', to_jsonb(p_ids)));

    return v_count;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 3. Bulk-удаление постов / историй.
--    Возвращает storage-пути удалённых файлов (image_url), чтобы клиент
--    почистил бакет — удаление строки не удаляет файл из Storage.
--    Денормализованные счётчики (likes_count/comments_count на самих постах)
--    уходят вместе с постом; счётчики профиля корректируются их триггерами
--    при каскадном удалении связей.
-- =====================================================================
create or replace function public.admin_bulk_delete_paintings(p_ids uuid[])
returns jsonb as $$
declare
    v_urls jsonb;
    v_count int;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;
    if p_ids is null or array_length(p_ids, 1) is null then
        return jsonb_build_object('deleted', 0, 'image_urls', '[]'::jsonb);
    end if;

    select coalesce(jsonb_agg(image_url), '[]'::jsonb) into v_urls
    from public.paintings where id = any(p_ids);

    delete from public.paintings where id = any(p_ids);
    get diagnostics v_count = row_count;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'bulk_delete', 'post', null,
            jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids)));

    return jsonb_build_object('deleted', v_count, 'image_urls', v_urls);
end;
$$ language plpgsql security definer;

create or replace function public.admin_bulk_delete_stories(p_ids uuid[])
returns jsonb as $$
declare
    v_urls jsonb;
    v_count int;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;
    if p_ids is null or array_length(p_ids, 1) is null then
        return jsonb_build_object('deleted', 0, 'image_urls', '[]'::jsonb);
    end if;

    select coalesce(jsonb_agg(image_url), '[]'::jsonb) into v_urls
    from public.stories where id = any(p_ids);

    delete from public.stories where id = any(p_ids);
    get diagnostics v_count = row_count;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'bulk_delete', 'story', null,
            jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids)));

    return jsonb_build_object('deleted', v_count, 'image_urls', v_urls);
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 4a. Список тегов с usage (painting_tags) и followers (tag_follows по имени).
-- =====================================================================
create or replace function public.admin_list_tags(
    p_search text default null,
    p_limit  int  default 50,
    p_offset int  default 0
) returns jsonb as $$
declare
    v_rows   jsonb;
    v_total  int;
    v_search text;
    v_limit  int := greatest(1, least(coalesce(p_limit, 50), 200));
    v_offset int := greatest(0, coalesce(p_offset, 0));
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_search := nullif(trim(coalesce(p_search, '')), '');

    select count(*) into v_total
    from public.tags t
    where v_search is null or t.name ilike '%' || v_search || '%';

    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows from (
        select
            t.id, t.name, t.created_at,
            (select count(*) from public.painting_tags pt where pt.tag_id = t.id) as usage_count,
            (select count(*) from public.tag_follows tf where tf.tag_name = t.name) as follower_count
        from public.tags t
        where v_search is null or t.name ilike '%' || v_search || '%'
        order by (select count(*) from public.painting_tags pt where pt.tag_id = t.id) desc, t.name asc
        limit v_limit offset v_offset
    ) x;

    return jsonb_build_object('total', v_total, 'tags', v_rows);
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 4b. Переименование тега. Имя нормализуется (trim + lower).
--     Если такое имя уже занято другим тегом — ошибка 'tag_exists'
--     (UI предложит мерж). tag_follows (ключ по имени) обновляются.
-- =====================================================================
create or replace function public.admin_rename_tag(p_tag_id uuid, p_new_name text)
returns boolean as $$
declare
    v_old_name text;
    v_new_name text;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_new_name := lower(nullif(trim(coalesce(p_new_name, '')), ''));
    if v_new_name is null then
        raise exception 'empty_name';
    end if;

    select name into v_old_name from public.tags where id = p_tag_id;
    if v_old_name is null then
        raise exception 'tag_not_found';
    end if;
    if v_old_name = v_new_name then
        return true;
    end if;

    if exists (select 1 from public.tags where name = v_new_name and id <> p_tag_id) then
        raise exception 'tag_exists';
    end if;

    update public.tags set name = v_new_name where id = p_tag_id;

    -- tag_follows ключ (user_id, tag_name): переносим подписчиков на новое имя,
    -- пропуская тех, у кого уже есть подписка на это имя (защита от дубль-PK).
    delete from public.tag_follows tf
    where tf.tag_name = v_old_name
      and exists (select 1 from public.tag_follows x
                  where x.user_id = tf.user_id and x.tag_name = v_new_name);
    update public.tag_follows set tag_name = v_new_name where tag_name = v_old_name;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'rename_tag', 'tag', p_tag_id::text,
            jsonb_build_object('old', v_old_name, 'new', v_new_name));

    return true;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 4c. Мерж тега p_source_id в p_target_id. Переписывает painting_tags
--     и tag_follows, затем удаляет исходный тег. Всё в одной транзакции
--     (тело функции атомарно).
-- =====================================================================
create or replace function public.admin_merge_tags(p_source_id uuid, p_target_id uuid)
returns boolean as $$
declare
    v_src_name text;
    v_tgt_name text;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;
    if p_source_id = p_target_id then
        raise exception 'same_tag';
    end if;

    select name into v_src_name from public.tags where id = p_source_id;
    select name into v_tgt_name from public.tags where id = p_target_id;
    if v_src_name is null or v_tgt_name is null then
        raise exception 'tag_not_found';
    end if;

    -- painting_tags: убрать связи источника там, где у поста уже есть целевой тег,
    -- остальные перевести на целевой.
    delete from public.painting_tags ps
    where ps.tag_id = p_source_id
      and exists (select 1 from public.painting_tags pt
                  where pt.painting_id = ps.painting_id and pt.tag_id = p_target_id);
    update public.painting_tags set tag_id = p_target_id where tag_id = p_source_id;

    -- tag_follows: перенести подписчиков на имя целевого тега, без дублей.
    delete from public.tag_follows tf
    where tf.tag_name = v_src_name
      and exists (select 1 from public.tag_follows x
                  where x.user_id = tf.user_id and x.tag_name = v_tgt_name);
    update public.tag_follows set tag_name = v_tgt_name where tag_name = v_src_name;

    -- Удаляем исходный тег (оставшиеся painting_tags уйдут каскадом).
    delete from public.tags where id = p_source_id;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'merge_tag', 'tag', p_target_id::text,
            jsonb_build_object('source', v_src_name, 'target', v_tgt_name));

    return true;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 4d. Удаление тега (бан спам-тега). Каскадом снимает painting_tags,
--     вручную чистит tag_follows (ключ по имени, без FK на tags).
-- =====================================================================
create or replace function public.admin_delete_tag(p_tag_id uuid)
returns boolean as $$
declare
    v_name text;
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    select name into v_name from public.tags where id = p_tag_id;
    if v_name is null then
        raise exception 'tag_not_found';
    end if;

    delete from public.tags where id = p_tag_id;
    delete from public.tag_follows where tag_name = v_name;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'delete_tag', 'tag', p_tag_id::text,
            jsonb_build_object('name', v_name));

    return true;
end;
$$ language plpgsql security definer;

-- Доступ к RPC только аутентифицированным; внутри каждая проверяет роль.
grant execute on function public.admin_list_content(text, text, uuid, text, int, int) to authenticated;
grant execute on function public.admin_set_nsfw(uuid, boolean) to authenticated;
grant execute on function public.admin_bulk_set_nsfw(uuid[], boolean) to authenticated;
grant execute on function public.admin_bulk_delete_paintings(uuid[]) to authenticated;
grant execute on function public.admin_bulk_delete_stories(uuid[]) to authenticated;
grant execute on function public.admin_list_tags(text, int, int) to authenticated;
grant execute on function public.admin_rename_tag(uuid, text) to authenticated;
grant execute on function public.admin_merge_tags(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_tag(uuid) to authenticated;
