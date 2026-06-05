-- Migration: referral_codes_registry
-- Реестр реферальных кодов, чтобы админ мог создавать кастомные коды заранее
-- (с названием/меткой), а не только видеть те, что «органически» появились в
-- profiles.referral_code. Зависит от 20260605010000_referral_tracking.sql.

-- 1. Таблица-реестр кодов.
CREATE TABLE IF NOT EXISTS public.referral_codes (
    code TEXT PRIMARY KEY,
    label TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Читать реестр могут админы; запись — только через SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "Admins can view referral codes" ON public.referral_codes;
CREATE POLICY "Admins can view referral codes" ON public.referral_codes
    FOR SELECT USING (public.has_role('admin'::admin_role_type));

-- =====================================================================
-- 2. Создание кода. Нормализует ввод (a-z0-9_-, нижний регистр, до 64 симв).
--    p_code пустой → генерируется случайный. Доступ — admin.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_create_referral_code(
    p_code TEXT default null,
    p_label TEXT default null
) RETURNS jsonb AS $$
DECLARE
    v_code TEXT;
    v_label TEXT;
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_code := lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9_-]', '', 'g'));
    v_code := left(v_code, 64);

    -- Пустой ввод → случайный 8-символьный код.
    IF v_code = '' THEN
        v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END IF;

    v_label := nullif(trim(coalesce(p_label, '')), '');

    INSERT INTO public.referral_codes (code, label, created_by)
    VALUES (v_code, v_label, auth.uid())
    ON CONFLICT (code) DO NOTHING;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'exists', 'code', v_code);
    END IF;

    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, meta)
    VALUES (auth.uid(), 'create_referral_code', 'referral_code', v_code,
            jsonb_build_object('label', v_label));

    RETURN jsonb_build_object('ok', true, 'code', v_code, 'label', v_label);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 3. Удаление кода из реестра. Профили, уже привязанные к коду, не трогаются
--    (атрибуция сохраняется). Доступ — admin.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_referral_code(p_code TEXT)
RETURNS boolean AS $$
BEGIN
    IF NOT public.has_role('admin'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    DELETE FROM public.referral_codes WHERE code = p_code;

    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, meta)
    VALUES (auth.uid(), 'delete_referral_code', 'referral_code', p_code, '{}'::jsonb);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 4. Статистика рефералов: теперь объединяет реестр (коды с 0 регистраций
--    тоже видны, с меткой) и «органические» коды из profiles.
--    Переопределяет функцию из 20260605010000_referral_tracking.sql.
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

    WITH counts AS (
        SELECT
            p.referral_code AS code,
            count(*) AS cnt,
            count(*) FILTER (WHERE u.created_at > now() - interval '30 days') AS last_30d,
            max(u.created_at) AS last_signup
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE p.referral_code IS NOT NULL AND p.referral_code <> ''
        GROUP BY p.referral_code
    ),
    merged AS (
        -- Все коды из реестра + органические коды, которых нет в реестре.
        SELECT rc.code, rc.label, true AS registered FROM public.referral_codes rc
        UNION
        SELECT c.code, NULL::text, false FROM counts c
        WHERE NOT EXISTS (SELECT 1 FROM public.referral_codes rc WHERE rc.code = c.code)
    )
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_codes FROM (
        SELECT
            m.code,
            m.label,
            m.registered,
            coalesce(c.cnt, 0) AS count,
            coalesce(c.last_30d, 0) AS last_30d,
            c.last_signup
        FROM merged m
        LEFT JOIN counts c ON c.code = m.code
        ORDER BY coalesce(c.cnt, 0) DESC, m.code ASC
    ) t;

    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_hosts FROM (
        SELECT p.referrer_host AS host, count(*) AS count
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

GRANT EXECUTE ON FUNCTION public.admin_create_referral_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_stats() TO authenticated;
