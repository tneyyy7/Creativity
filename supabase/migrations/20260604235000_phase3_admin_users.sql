-- Migration phase3_admin_users.sql
-- Этап 3 админ-панели: управление пользователями.
--   1. subscriptions.source — разделяет ручной grant Pro от Stripe-подписки,
--      чтобы вебхук не перетирал ручную выдачу (см. подводные камни этапа 3).
--   2. Триггер защиты от эскалации привилегий: менять admin_role может только
--      superadmin, даже если RLS profiles_admin_update пускает любую админ-роль.
--   3. RPC-функции (SECURITY DEFINER) для поиска юзеров с email из auth.users,
--      карточки юзера, смены роли, ручной выдачи/снятия Pro. Email и привилегии
--      обрабатываются на стороне БД — service-role ключ в браузер не попадает.
-- Идемпотентно. Зависит от phase3_admin_foundation.sql и subscription_migrations.sql.

-- =====================================================================
-- 1. Источник подписки: 'stripe' (по умолчанию) или 'manual' (ручной grant).
-- =====================================================================
alter table public.subscriptions add column if not exists source text not null default 'stripe';

-- =====================================================================
-- 2. Защита от эскалации привилегий на уровне БД.
--    RLS profiles_admin_update пускает любую админ-роль обновлять profiles
--    (нужно для бана). Но менять КОЛОНКУ admin_role вправе только superadmin —
--    иначе модератор мог бы повысить себя прямым вызовом Supabase.
-- =====================================================================
create or replace function public.protect_admin_role_change()
returns trigger as $$
begin
    if coalesce(new.admin_role::text, '') is distinct from coalesce(old.admin_role::text, '') then
        if not public.has_role('superadmin'::admin_role_type) then
            raise exception 'Only superadmin can change admin_role';
        end if;
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_admin_role_change on public.profiles;
create trigger trg_protect_admin_role_change
    before update on public.profiles
    for each row execute function public.protect_admin_role_change();

-- =====================================================================
-- 3a. Поиск/список пользователей с серверной пагинацией.
--     Возвращает email из auth.users (недоступен с клиента напрямую),
--     роль, бан, pro-статус. Доступ — от admin (управление юзерами).
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
            p.avatar_url,
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
-- 3b. Карточка пользователя: профиль, email, подписка, агрегаты.
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
            p.id, p.nickname, p.avatar_url, p.bio, p.is_banned, p.admin_role,
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

-- =====================================================================
-- 3c. Смена админ-роли — только superadmin. Пишет аудит-лог.
--     p_role: 'moderator' | 'admin' | 'superadmin' | NULL (снять роль).
-- =====================================================================
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns boolean as $$
declare
    v_old_role admin_role_type;
begin
    if not public.has_role('superadmin'::admin_role_type) then
        raise exception 'Only superadmin can assign roles';
    end if;

    select admin_role into v_old_role from public.profiles where id = p_user_id;

    -- trg_protect_last_superadmin не даст снять последнего superadmin.
    update public.profiles
    set admin_role = nullif(p_role, '')::admin_role_type
    where id = p_user_id;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'set_admin_role', 'user', p_user_id::text,
            jsonb_build_object('old_role', v_old_role, 'new_role', p_role));

    return true;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 3d. Ручная выдача Pro (саппорт/компенсации). Помечается source='manual',
--     чтобы Stripe-вебхук её не перетёр. Доступ — admin.
-- =====================================================================
create or replace function public.admin_grant_pro(p_user_id uuid, p_months int default 1)
returns boolean as $$
declare
    v_end timestamptz;
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    v_end := now() + (greatest(1, p_months) || ' months')::interval;

    insert into public.subscriptions (user_id, plan, status, current_period_end, source, updated_at)
    values (p_user_id, 'pro_monthly', 'active', v_end, 'manual', now())
    on conflict (user_id) do update
        set plan = 'pro_monthly',
            status = 'active',
            current_period_end = v_end,
            source = 'manual',
            updated_at = now();

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'grant_pro', 'user', p_user_id::text,
            jsonb_build_object('months', greatest(1, p_months), 'until', v_end));

    return true;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 3e. Снятие ручного Pro. НЕ трогает Stripe-подписки (source='stripe') —
--     их отменять только через Stripe, иначе вебхук перетрёт. Доступ — admin.
-- =====================================================================
create or replace function public.admin_revoke_pro(p_user_id uuid)
returns jsonb as $$
declare
    v_source text;
begin
    if not public.has_role('admin'::admin_role_type) then
        raise exception 'Access denied';
    end if;

    select source into v_source from public.subscriptions where user_id = p_user_id;

    if v_source is null then
        return jsonb_build_object('ok', false, 'reason', 'no_subscription');
    end if;

    if v_source <> 'manual' then
        -- Stripe — отменять только через Stripe Dashboard / edge-функцию.
        return jsonb_build_object('ok', false, 'reason', 'stripe_managed');
    end if;

    update public.subscriptions
    set status = 'expired', current_period_end = now(), updated_at = now()
    where user_id = p_user_id;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'revoke_pro', 'user', p_user_id::text, '{}'::jsonb);

    return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

-- Доступ к RPC только аутентифицированным; внутри каждая проверяет роль.
grant execute on function public.admin_search_users(text, int, int) to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_grant_pro(uuid, int) to authenticated;
grant execute on function public.admin_revoke_pro(uuid) to authenticated;
