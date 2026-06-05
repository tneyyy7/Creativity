-- Migration: referral_tracking
-- Атрибуция регистраций: по какой кастомной ссылке (?ref=код) и с какого
-- домена (document.referrer) пришёл новый пользователь. Используется для
-- персональных ссылок друзей и вкладки "Referrals" в админ-панели.

-- 1. Колонки атрибуции на профиле (first-touch — пишутся один раз при создании).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referrer_host TEXT;

CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS profiles_referrer_host_idx ON public.profiles(referrer_host);

-- =====================================================================
-- 2. Поиск пользователей: добавляем referral_code/referrer_host в выдачу
--    и в условие поиска. (Переопределяем функцию из phase3_admin_users.)
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
            p.avatar_url,
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
-- 3. Карточка пользователя: добавляем referral_code/referrer_host.
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
            p.id, p.nickname, p.avatar_url, p.bio, p.is_banned, p.admin_role,
            p.is_verified, p.last_seen, p.finished_work_count,
            p.referral_code, p.referrer_host,
            u.email, u.created_at, u.last_sign_in_at,
            s.status AS sub_status, s.plan AS sub_plan, s.source AS sub_source,
            s.current_period_end AS sub_period_end,
            (s.status = 'active' OR (s.status = 'cancelled' AND s.current_period_end > now())) AS is_pro
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        LEFT JOIN public.subscriptions s ON s.user_id = p.id
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
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 6
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
-- 4. Агрегированная статистика рефералов для вкладки "Referrals".
--    Возвращает разбивку по ref-кодам и по доменам-источникам.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_referral_stats()
RETURNS jsonb AS $$
DECLARE
    v_codes jsonb;
    v_hosts jsonb;
    v_total_attributed int;
    v_total_users int;
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_codes FROM (
        SELECT
            p.referral_code AS code,
            count(*) AS count,
            count(*) FILTER (WHERE u.created_at > now() - interval '30 days') AS last_30d,
            max(u.created_at) AS last_signup
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE p.referral_code IS NOT NULL AND p.referral_code <> ''
        GROUP BY p.referral_code
        ORDER BY count(*) DESC
    ) t;

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_hosts FROM (
        SELECT
            p.referrer_host AS host,
            count(*) AS count
        FROM public.profiles p
        WHERE p.referrer_host IS NOT NULL AND p.referrer_host <> ''
        GROUP BY p.referrer_host
        ORDER BY count(*) DESC
        LIMIT 50
    ) t;

    SELECT count(*) INTO v_total_attributed
    FROM public.profiles WHERE referral_code IS NOT NULL AND referral_code <> '';

    SELECT count(*) INTO v_total_users FROM public.profiles;

    RETURN jsonb_build_object(
        'codes', v_codes,
        'hosts', v_hosts,
        'total_attributed', v_total_attributed,
        'total_users', v_total_users
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 5. Список пользователей по конкретному ref-коду (drill-down во вкладке).
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
        SELECT p.id, p.nickname, p.avatar_url, p.referrer_host, u.email, u.created_at
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE p.referral_code = p_code
        ORDER BY u.created_at DESC NULLS LAST
        LIMIT greatest(1, least(p_limit, 100))
        OFFSET greatest(0, p_offset)
    ) t;

    RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_users(text, int, int) TO authenticated;
