-- Migration phase2_admin_fixes.sql
-- Доводит фазы 1 и 2 админ-панели до рабочего состояния:
--   1. RLS-аудит: admin-политики переведены со старого is_admin(uid) на
--      роле-осведомлённую is_admin() (учитывает admin_role, а не только булев флаг).
--   2. Защита последнего superadmin от случайного понижения.
--   3. Пересоздание get_admin_dashboard_stats: корректный подсчёт активных
--      подписок и MRR, блок недавних отмен, заполнение пропусков в графиках.
-- Идемпотентно: безопасно перезапускать. Зависит от phase3_admin_foundation.sql.

-- =====================================================================
-- 1. RLS-аудит — admin-действия должны проверять РОЛЬ, а не только is_admin.
--    public.is_admin() (без аргумента, из phase3_admin_foundation) возвращает
--    true, если is_admin=true ИЛИ задан admin_role (moderator/admin/superadmin).
--    Так модератор с admin_role, но без is_admin=true, реально получает доступ.
-- =====================================================================
drop policy if exists reports_admin_select on public.reports;
create policy reports_admin_select on public.reports
  for select using (public.is_admin());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists paintings_admin_delete on public.paintings;
create policy paintings_admin_delete on public.paintings
  for delete using (public.is_admin());

drop policy if exists post_comments_admin_delete on public.post_comments;
create policy post_comments_admin_delete on public.post_comments
  for delete using (public.is_admin());

-- Бан/разбан is_banned — доступно любой админ-роли: бан пользователя является
-- частью потока обработки жалоб (модераторский уровень), как и удаление контента.
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- 2. Защита последнего superadmin — нельзя снять роль у единственного.
-- =====================================================================
create or replace function public.protect_last_superadmin()
returns trigger as $$
declare
    v_other_supers int;
begin
    -- Срабатывает, только когда у строки СНИМАЮТ superadmin-доступ.
    if (coalesce(old.admin_role::text, '') = 'superadmin' or old.is_admin = true)
       and (coalesce(new.admin_role::text, '') <> 'superadmin' and coalesce(new.is_admin, false) <> true)
    then
        select count(*) into v_other_supers
        from public.profiles
        where id <> old.id
          and (admin_role = 'superadmin' or is_admin = true);

        if v_other_supers = 0 then
            raise exception 'Cannot remove the last superadmin';
        end if;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_last_superadmin on public.profiles;
create trigger trg_protect_last_superadmin
    before update on public.profiles
    for each row execute function public.protect_last_superadmin();

-- =====================================================================
-- 3. Dashboard stats — пересоздание с исправлениями.
-- =====================================================================
create or replace function public.get_admin_dashboard_stats()
returns jsonb as $$
declare
    v_total_users int;
    v_new_users_7d int;
    v_active_subs int;
    v_mrr numeric;
    v_pending_reports int;
    v_total_posts int;
    v_new_posts_24h int;
    v_chart_registrations jsonb;
    v_chart_posts jsonb;
    v_recent_actions jsonb;
    v_recent_reports jsonb;
    v_recent_cancellations jsonb;
begin
    -- Проверка прав (минимум — модератор).
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    -- Базовые счётчики.
    select count(*) into v_total_users from public.profiles;
    select count(*) into v_new_users_7d from auth.users where created_at > now() - interval '7 days';

    -- Активные подписки: active ИЛИ отменённые, но ещё внутри оплаченного периода
    -- (совпадает с логикой public.is_user_pro). 'trialing' в этой схеме нет.
    select count(*) into v_active_subs
    from public.subscriptions
    where status = 'active'
       or (status = 'cancelled' and current_period_end > now());

    -- MRR: pro_monthly = $4.99/мес, pro_yearly = $39.99/год ≈ $3.33/мес.
    select coalesce(sum(
        case
            when plan = 'pro_monthly' then 4.99
            when plan = 'pro_yearly' then 39.99 / 12.0
            else 0
        end
    ), 0)::numeric(10,2) into v_mrr
    from public.subscriptions
    where status = 'active'
       or (status = 'cancelled' and current_period_end > now());

    -- Жалобы.
    select count(*) into v_pending_reports from public.reports where status = 'pending';

    -- Контент.
    select count(*) into v_total_posts from public.paintings;
    select count(*) into v_new_posts_24h from public.paintings where created_at > now() - interval '24 hours';

    -- График регистраций (7 дней, с заполнением пропущенных дней нулями).
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_chart_registrations from (
        select to_char(d.day, 'YYYY-MM-DD') as date, coalesce(c.count, 0) as count
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') d(day)
        left join (
            select date(created_at) as dt, count(*) as count
            from auth.users
            where created_at > now() - interval '7 days'
            group by date(created_at)
        ) c on c.dt = d.day::date
        order by d.day asc
    ) t;

    -- График постов (7 дней, с заполнением пропусков).
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_chart_posts from (
        select to_char(d.day, 'YYYY-MM-DD') as date, coalesce(c.count, 0) as count
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') d(day)
        left join (
            select date(created_at) as dt, count(*) as count
            from public.paintings
            where created_at > now() - interval '7 days'
            group by date(created_at)
        ) c on c.dt = d.day::date
        order by d.day asc
    ) t;

    -- Недавние pending-жалобы.
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_recent_reports from (
        select r.id, r.target_type, r.target_id, r.reason, r.created_at, r.status,
               reporter.nickname as reporter_name
        from public.reports r
        left join public.profiles reporter on r.reporter_id = reporter.id
        where r.status = 'pending'
        order by r.created_at desc
        limit 5
    ) t;

    -- Недавние действия админов.
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_recent_actions from (
        select a.id, a.action, a.target_type, a.target_id, a.created_at, p.nickname as admin_name
        from public.admin_actions a
        left join public.profiles p on a.admin_id = p.id
        order by a.created_at desc
        limit 5
    ) t;

    -- Недавние отмены подписок.
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_recent_cancellations from (
        select s.id, s.plan, s.current_period_end, s.updated_at, p.nickname as user_name
        from public.subscriptions s
        left join public.profiles p on s.user_id = p.id
        where s.status = 'cancelled'
        order by s.updated_at desc
        limit 5
    ) t;

    return jsonb_build_object(
        'total_users', v_total_users,
        'new_users_7d', v_new_users_7d,
        'active_subs', v_active_subs,
        'mrr', v_mrr,
        'pending_reports', v_pending_reports,
        'total_posts', v_total_posts,
        'new_posts_24h', v_new_posts_24h,
        'chart_registrations', v_chart_registrations,
        'chart_posts', v_chart_posts,
        'recent_reports', v_recent_reports,
        'recent_actions', v_recent_actions,
        'recent_cancellations', v_recent_cancellations
    );
end;
$$ language plpgsql security definer;
