-- Migration: admin_logs_list
-- RPC для вкладки "Logs" в админ-панели: листинг audit-лога (admin_actions)
-- с присоединёнными данными админа, фильтрами и пагинацией.

CREATE OR REPLACE FUNCTION public.admin_list_logs(
    p_search TEXT DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
    v_total BIGINT;
    v_items JSONB;
    v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
    v_action TEXT := NULLIF(TRIM(COALESCE(p_action, '')), '');
    v_target TEXT := NULLIF(TRIM(COALESCE(p_target_type, '')), '');
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    -- Только admin / superadmin (или legacy is_admin) могут читать логи.
    IF NOT public.has_role('admin') THEN
        RAISE EXCEPTION 'Not authorized to view admin logs';
    END IF;

    WITH filtered AS (
        SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.meta, a.created_at,
               p.nickname AS admin_nickname, p.avatar_url AS admin_avatar
        FROM public.admin_actions a
        LEFT JOIN public.profiles p ON p.id = a.admin_id
        WHERE (v_action IS NULL OR a.action = v_action)
          AND (v_target IS NULL OR a.target_type = v_target)
          AND (
            v_search IS NULL
            OR a.action ILIKE '%' || v_search || '%'
            OR a.target_type ILIKE '%' || v_search || '%'
            OR a.target_id ILIKE '%' || v_search || '%'
            OR COALESCE(p.nickname, '') ILIKE '%' || v_search || '%'
          )
    )
    SELECT COUNT(*) INTO v_total FROM filtered;

    WITH filtered AS (
        SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.meta, a.created_at,
               p.nickname AS admin_nickname, p.avatar_url AS admin_avatar
        FROM public.admin_actions a
        LEFT JOIN public.profiles p ON p.id = a.admin_id
        WHERE (v_action IS NULL OR a.action = v_action)
          AND (v_target IS NULL OR a.target_type = v_target)
          AND (
            v_search IS NULL
            OR a.action ILIKE '%' || v_search || '%'
            OR a.target_type ILIKE '%' || v_search || '%'
            OR a.target_id ILIKE '%' || v_search || '%'
            OR COALESCE(p.nickname, '') ILIKE '%' || v_search || '%'
          )
        ORDER BY a.created_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(filtered)), '[]'::jsonb) INTO v_items FROM filtered;

    RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Список уникальных типов действий и целей — для фильтров в UI.
CREATE OR REPLACE FUNCTION public.admin_log_facets()
RETURNS JSONB AS $$
DECLARE
    v_actions JSONB;
    v_targets JSONB;
BEGIN
    IF NOT public.has_role('admin') THEN
        RAISE EXCEPTION 'Not authorized to view admin logs';
    END IF;

    SELECT COALESCE(jsonb_agg(DISTINCT action ORDER BY action), '[]'::jsonb)
    INTO v_actions FROM public.admin_actions;

    SELECT COALESCE(jsonb_agg(DISTINCT target_type ORDER BY target_type), '[]'::jsonb)
    INTO v_targets FROM public.admin_actions;

    RETURN jsonb_build_object('actions', v_actions, 'targets', v_targets);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_list_logs(TEXT, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_facets() TO authenticated;
