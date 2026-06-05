-- Migration phase5_admin_subscriptions.sql
-- Этап 5 админ-панели: видимость подписок и биллинга.
--   1. admin_list_subscriptions — список подписок с email (из auth.users),
--      ником, статусом, источником (stripe/manual), периодом. Серверная
--      пагинация + фильтр по статусу + поиск по нику/email/stripe id.
--   2. admin_subscription_stats — агрегаты для карточек: счётчики по статусам,
--      активные по тарифам (для расчёта MRR на клиенте), доля manual/stripe.
-- Все RPC — SECURITY DEFINER с проверкой роли (минимум admin). Только чтение.
-- Любые операции со Stripe (отмена/рефанд) живут в edge-функции с service-role
-- ключом — секрет Stripe в браузер не попадает. Источник истины — Stripe;
-- БД лишь отражает вебхуки и может отставать.
-- Зависит от phase3_admin_foundation.sql (has_role, admin_actions) и
-- subscription_migrations.sql / add_stripe_columns.sql / phase3_admin_users.sql (source).

-- =====================================================================
-- 1. Список подписок с серверной пагинацией.
--    p_status: 'all' | 'active' | 'cancelled' | 'expired' | 'inactive'
--    p_search: ILIKE по нику / email / stripe_subscription_id
--    Pro-флаг считается так же, как в остальной кодовой базе:
--    active ИЛИ (cancelled и период ещё не истёк).
-- =====================================================================
create or replace function public.admin_list_subscriptions(
    p_search text default null,
    p_status text default 'all',
    p_limit  int  default 25,
    p_offset int  default 0
) returns jsonb as $$
declare
    v_rows   jsonb;
    v_total  int;
    v_search text;
    v_status text := nullif(trim(coalesce(p_status, 'all')), '');
    v_limit  int := greatest(1, least(coalesce(p_limit, 25), 100));
    v_offset int := greatest(0, coalesce(p_offset, 0));
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_search := nullif(trim(coalesce(p_search, '')), '');
    if v_status = 'all' then v_status := null; end if;

    select count(*) into v_total
    from public.subscriptions s
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
    where (v_status is null or s.status = v_status)
      and (v_search is null
           or p.nickname ilike '%' || v_search || '%'
           or u.email ilike '%' || v_search || '%'
           or s.stripe_subscription_id ilike '%' || v_search || '%');

    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
        select
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
             or (s.status = 'cancelled' and s.current_period_end > now())) as is_pro,
            p.nickname as user_nickname,
            p.avatar_url as user_avatar,
            u.email as user_email
        from public.subscriptions s
        left join public.profiles p on p.id = s.user_id
        left join auth.users u on u.id = s.user_id
        where (v_status is null or s.status = v_status)
          and (v_search is null
               or p.nickname ilike '%' || v_search || '%'
               or u.email ilike '%' || v_search || '%'
               or s.stripe_subscription_id ilike '%' || v_search || '%')
        order by s.updated_at desc nulls last
        limit v_limit offset v_offset
    ) t;

    return jsonb_build_object('total', v_total, 'items', v_rows);
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 2. Агрегаты для дашборда подписок. Счётчики по статусам и активные
--    по тарифам — MRR считается на клиенте (цены тарифов живут в коде,
--    в БД их нет). active_pro = «реально про» (active или cancelled с
--    непросроченным периодом).
-- =====================================================================
create or replace function public.admin_subscription_stats()
returns jsonb as $$
declare
    v_result jsonb;
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    select jsonb_build_object(
        'total',          count(*),
        'active',         count(*) filter (where status = 'active'),
        'cancelled',      count(*) filter (where status = 'cancelled'),
        'expired',        count(*) filter (where status = 'expired'),
        'inactive',       count(*) filter (where status = 'inactive'),
        'manual',         count(*) filter (where source = 'manual'),
        'stripe',         count(*) filter (where source = 'stripe'),
        'active_pro',     count(*) filter (
                              where status = 'active'
                                 or (status = 'cancelled' and current_period_end > now())),
        'active_monthly', count(*) filter (
                              where plan = 'pro_monthly'
                                and (status = 'active'
                                     or (status = 'cancelled' and current_period_end > now()))),
        'active_yearly',  count(*) filter (
                              where plan = 'pro_yearly'
                                and (status = 'active'
                                     or (status = 'cancelled' and current_period_end > now())))
    ) into v_result
    from public.subscriptions;

    return coalesce(v_result, '{}'::jsonb);
end;
$$ language plpgsql security definer;

-- Доступ к RPC только аутентифицированным; внутри каждая проверяет роль.
grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;
grant execute on function public.admin_subscription_stats() to authenticated;
