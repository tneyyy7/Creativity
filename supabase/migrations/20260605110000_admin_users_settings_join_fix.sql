-- Migration admin_users_settings_join_fix.sql
-- Изменяет административные функции поиска пользователей, деталей пользователя, подписок и рефералов,
-- чтобы nickname_color и avatar_frame выбирались из таблицы public.pro_profile_settings,
-- которая является единственным источником истины для настроек кастомизации на клиенте.

-- =====================================================================
-- 1. Поиск/список пользователей (admin_search_users)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_search_users(
    p_search text default null,
    p_limit int default 25,
    p_offset int default 0
) RETURNS jsonb AS $$
DECLARE
    v_rows jsonb;
    v_total int;
    v_search text;
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_search := nullif(trim(coalesce(p_search, '')), '');

    SELECT count(*) INTO v_total
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE v_search IS NULL
       OR p.nickname ILIKE '%' || v_search || '%'
       OR u.email ILIKE '%' || v_search || '%'
       OR p.referral_code ILIKE '%' || v_search || '%';

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows FROM (
        SELECT
            p.id,
            p.nickname,
            pps.nickname_color,
            p.avatar_url,
            coalesce(pps.avatar_frame, 'default') as avatar_frame,
            p.finished_work_count,
            p.is_banned,
            p.admin_role,
            p.referral_code,
            p.referrer_host,
            u.email,
            u.created_at,
            u.last_sign_in_at,
            (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now())) AS is_pro,
            s.plan AS sub_plan,
            s.source AS sub_source
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        LEFT JOIN public.subscriptions s ON s.user_id = p.id
        LEFT JOIN public.pro_profile_settings pps ON pps.user_id = p.id
        WHERE v_search IS NULL
           OR p.nickname ILIKE '%' || v_search || '%'
           OR u.email ILIKE '%' || v_search || '%'
           OR p.referral_code ILIKE '%' || v_search || '%'
        ORDER BY u.created_at DESC NULLS LAST
        LIMIT greatest(1, least(p_limit, 100))
        OFFSET greatest(0, p_offset)
    ) t;

    RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 2. Карточка пользователя (admin_get_user_details)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_details(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_profile jsonb;
    v_posts_count int;
    v_reports_against int;
    v_reports_made int;
    v_recent_posts jsonb;
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT to_jsonb(t) INTO v_profile FROM (
        SELECT
            p.id, p.nickname, pps.nickname_color, p.avatar_url, coalesce(pps.avatar_frame, 'default') as avatar_frame,
            p.bio, p.is_banned, p.admin_role,
            p.is_verified, p.last_seen, p.finished_work_count,
            p.referral_code, p.referrer_host,
            u.email, u.created_at, u.last_sign_in_at,
            s.status AS sub_status, s.plan AS sub_plan, s.source AS sub_source,
            s.current_period_end AS sub_period_end,
            (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now())) AS is_pro
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        LEFT JOIN public.subscriptions s ON s.user_id = p.id
        LEFT JOIN public.pro_profile_settings pps ON pps.user_id = p.id
        WHERE p.id = p_user_id
    ) t;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT count(*) INTO v_posts_count FROM public.paintings WHERE user_id = p_user_id;
    SELECT count(*) INTO v_reports_against FROM public.reports WHERE target_type = 'user' AND target_id = p_user_id;
    SELECT count(*) INTO v_reports_made FROM public.reports WHERE reporter_id = p_user_id;

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_posts FROM (
        SELECT id, title, image_url, is_nsfw, created_at
        FROM public.paintings
        where user_id = p_user_id
        order by created_at desc
        limit 6
    ) t;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'posts_count', v_posts_count,
        'reports_against', v_reports_against,
        'reports_made', v_reports_made,
        'recent_posts', v_recent_posts
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 3. Список подписок (admin_list_subscriptions)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(
    p_search text default null,
    p_status text default 'all',
    p_limit  int  default 25,
    p_offset int  default 0
) RETURNS jsonb AS $$
DECLARE
    v_rows   jsonb;
    v_total  int;
    v_search text;
    v_status text := nullif(trim(coalesce(p_status, 'all')), '');
    v_limit  int := greatest(1, least(coalesce(p_limit, 25), 100));
    v_offset int := greatest(0, coalesce(p_offset, 0));
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_search := nullif(trim(coalesce(p_search, '')), '');
    IF v_status = 'all' THEN v_status := null; END IF;

    SELECT count(*) INTO v_total
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN auth.users u ON u.id = s.user_id
    WHERE (v_status IS NULL OR s.status = v_status)
      AND (v_search IS NULL
           OR p.nickname ILIKE '%' || v_search || '%'
           OR u.email ILIKE '%' || v_search || '%'
           OR s.stripe_subscription_id ILIKE '%' || v_search || '%');

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows FROM (
        SELECT
            s.id,
            s.user_id,
            s.plan,
            s.status,
            s.source,
            s.stripe_subscription_id,
            s.stripe_customer_id,
            s.current_period_start,
            s.current_period_end,
            s.created_at,
            s.updated_at,
            (s.status = 'active'
             OR (s.status = 'cancelled' and s.current_period_end > now())) AS is_pro,
            p.nickname as user_nickname,
            pps.nickname_color as user_nickname_color,
            p.avatar_url as user_avatar,
            coalesce(pps.avatar_frame, 'default') as user_avatar_frame,
            p.finished_work_count as user_finished_work_count,
            u.email as user_email
        FROM public.subscriptions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        LEFT JOIN auth.users u ON u.id = s.user_id
        LEFT JOIN public.pro_profile_settings pps ON pps.user_id = s.user_id
        WHERE (v_status IS NULL OR s.status = v_status)
          AND (v_search IS NULL
               OR p.nickname ILIKE '%' || v_search || '%'
               OR u.email ILIKE '%' || v_search || '%'
               OR s.stripe_subscription_id ILIKE '%' || v_search || '%')
        ORDER BY s.updated_at DESC NULLS LAST
        LIMIT v_limit OFFSET v_offset
    ) t;

    RETURN jsonb_build_object('total', v_total, 'items', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 4. Список пользователей по рефералу (admin_referral_users)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_referral_users(
    p_code text,
    p_limit int default 50,
    p_offset int default 0
) RETURNS jsonb AS $$
DECLARE
    v_rows jsonb;
    v_total int;
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT count(*) INTO v_total FROM public.profiles WHERE referral_code = p_code;

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows FROM (
        SELECT
            p.id,
            p.nickname,
            pps.nickname_color,
            p.avatar_url,
            coalesce(pps.avatar_frame, 'default') as avatar_frame,
            p.finished_work_count,
            p.referrer_host,
            u.email,
            u.created_at,
            (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now())) AS is_pro
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        LEFT JOIN public.subscriptions s ON s.user_id = p.id
        LEFT JOIN public.pro_profile_settings pps ON pps.user_id = p.id
        WHERE p.referral_code = p_code
        ORDER BY u.created_at DESC NULLS LAST
        LIMIT greatest(1, least(p_limit, 100))
        OFFSET greatest(0, p_offset)
    ) t;

    RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Переприсвоение привилегий
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_subscriptions(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_users(text, int, int) TO authenticated;
