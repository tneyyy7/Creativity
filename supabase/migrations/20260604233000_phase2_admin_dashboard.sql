-- Migration phase2_admin_dashboard.sql
-- Создание функции для получения агрегированных метрик дашборда

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    v_total_users INT;
    v_new_users_7d INT;
    v_active_subs INT;
    v_pending_reports INT;
    v_total_posts INT;
    v_new_posts_24h INT;
    v_chart_registrations JSONB;
    v_chart_posts JSONB;
    v_recent_actions JSONB;
    v_recent_reports JSONB;
BEGIN
    -- Check permissions using the has_role function from phase 3 admin foundation
    IF NOT public.has_role('moderator'::admin_role_type) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Basic counters
    SELECT COUNT(*) INTO v_total_users FROM public.profiles;
    SELECT COUNT(*) INTO v_new_users_7d FROM auth.users WHERE created_at > NOW() - INTERVAL '7 days';
    
    -- Subscriptions (MRR will be just count of active/trialing for now)
    SELECT COUNT(*) INTO v_active_subs FROM public.subscriptions WHERE status IN ('active', 'trialing');

    -- Reports
    SELECT COUNT(*) INTO v_pending_reports FROM public.reports WHERE status = 'pending';

    -- Content
    SELECT COUNT(*) INTO v_total_posts FROM public.paintings;
    SELECT COUNT(*) INTO v_new_posts_24h FROM public.paintings WHERE created_at > NOW() - INTERVAL '24 hours';

    -- Registrations Chart (last 7 days grouped by day)
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_chart_registrations FROM (
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM auth.users 
        WHERE created_at > NOW() - INTERVAL '7 days' 
        GROUP BY DATE(created_at) 
        ORDER BY DATE(created_at) ASC
    ) t;

    -- Posts Chart (last 7 days grouped by day)
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_chart_posts FROM (
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM public.paintings 
        WHERE created_at > NOW() - INTERVAL '7 days' 
        GROUP BY DATE(created_at) 
        ORDER BY DATE(created_at) ASC
    ) t;

    -- Recent pending reports
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_reports FROM (
        SELECT r.id, r.target_type, r.target_id, r.reason, r.created_at, r.status,
               reporter.nickname as reporter_name
        FROM public.reports r
        LEFT JOIN public.profiles reporter ON r.reporter_id = reporter.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 5
    ) t;

    -- Recent actions
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_actions FROM (
        SELECT a.id, a.action, a.target_type, a.target_id, a.created_at, p.nickname as admin_name
        FROM public.admin_actions a
        LEFT JOIN public.profiles p ON a.admin_id = p.id
        ORDER BY a.created_at DESC
        LIMIT 5
    ) t;

    RETURN jsonb_build_object(
        'total_users', v_total_users,
        'new_users_7d', v_new_users_7d,
        'active_subs', v_active_subs,
        'pending_reports', v_pending_reports,
        'total_posts', v_total_posts,
        'new_posts_24h', v_new_posts_24h,
        'chart_registrations', v_chart_registrations,
        'chart_posts', v_chart_posts,
        'recent_reports', v_recent_reports,
        'recent_actions', v_recent_actions
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
