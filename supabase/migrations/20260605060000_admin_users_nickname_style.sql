-- Migration admin_users_nickname_style.sql
-- Админ-панель показывала ники белым цветом и неправильные рамки аватара,
-- потому что RPC admin_search_users / admin_get_user_details не возвращали
-- nickname_color, avatar_frame и finished_work_count. Добавляем эти поля,
-- чтобы карточка и список рисовали кастомный цвет ника и корректную рамку.
-- Идемпотентно. Зависит от phase3_admin_users.sql.

-- =====================================================================
-- 0. Колонки кастомизации профиля. В боевой БД их не было (legacy-миграция
--    subscription_migrations.sql не накатывалась), из-за чего ник/рамка нигде
--    не сохранялись. Создаём идемпотентно, чтобы фича заработала везде.
-- =====================================================================
alter table public.profiles add column if not exists nickname_color text;
alter table public.profiles add column if not exists avatar_frame text default 'default';

-- =====================================================================
-- 3a. Поиск/список пользователей — добавляем стиль ника и ранг.
-- =====================================================================
create or replace function public.admin_search_users(
    p_search text default null,
    p_limit int default 25,
    p_offset int default 0
) returns jsonb as $$
declare
    v_rows jsonb;
    v_total int;
    v_search text;
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_search := nullif(trim(coalesce(p_search, '')), '');

    select count(*) into v_total
    from public.profiles p
    left join auth.users u on u.id = p.id
    where v_search is null
       or p.nickname ilike '%' || v_search || '%'
       or u.email ilike '%' || v_search || '%';

    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
        select
            p.id,
            p.nickname,
            p.nickname_color,
            p.avatar_url,
            p.avatar_frame,
            p.finished_work_count,
            p.is_banned,
            p.admin_role,
            u.email,
            u.created_at,
            u.last_sign_in_at,
            (s.status = 'active' or (s.status = 'cancelled' and s.current_period_end > now())) as is_pro,
            s.plan as sub_plan,
            s.source as sub_source
        from public.profiles p
        left join auth.users u on u.id = p.id
        left join public.subscriptions s on s.user_id = p.id
        where v_search is null
           or p.nickname ilike '%' || v_search || '%'
           or u.email ilike '%' || v_search || '%'
        order by u.created_at desc nulls last
        limit greatest(1, least(p_limit, 100))
        offset greatest(0, p_offset)
    ) t;

    return jsonb_build_object('total', v_total, 'users', v_rows);
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 3b. Карточка пользователя — добавляем стиль ника.
-- =====================================================================
create or replace function public.admin_get_user_details(p_user_id uuid)
returns jsonb as $$
declare
    v_profile jsonb;
    v_posts_count int;
    v_reports_against int;
    v_reports_made int;
    v_recent_posts jsonb;
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    select to_jsonb(t) into v_profile from (
        select
            p.id, p.nickname, p.nickname_color, p.avatar_url, p.avatar_frame,
            p.bio, p.is_banned, p.admin_role,
            p.is_verified, p.last_seen, p.finished_work_count,
            u.email, u.created_at, u.last_sign_in_at,
            s.status as sub_status, s.plan as sub_plan, s.source as sub_source,
            s.current_period_end as sub_period_end,
            (s.status = 'active' or (s.status = 'cancelled' and s.current_period_end > now())) as is_pro
        from public.profiles p
        left join auth.users u on u.id = p.id
        left join public.subscriptions s on s.user_id = p.id
        where p.id = p_user_id
    ) t;

    if v_profile is null then
        raise exception 'User not found';
    end if;

    select count(*) into v_posts_count from public.paintings where user_id = p_user_id;
    select count(*) into v_reports_against from public.reports where target_type = 'user' and target_id = p_user_id;
    select count(*) into v_reports_made from public.reports where reporter_id = p_user_id;

    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_recent_posts from (
        select id, title, image_url, is_nsfw, created_at
        from public.paintings
        where user_id = p_user_id
        order by created_at desc
        limit 6
    ) t;

    return jsonb_build_object(
        'profile', v_profile,
        'posts_count', v_posts_count,
        'reports_against', v_reports_against,
        'reports_made', v_reports_made,
        'recent_posts', v_recent_posts
    );
end;
$$ language plpgsql security definer;
