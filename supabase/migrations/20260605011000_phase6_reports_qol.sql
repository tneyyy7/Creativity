-- Migration phase6_reports_qol.sql
-- Этап 6 админ-панели: качество жизни очереди жалоб.
--   1. Bulk-смена статуса жалоб (выделить → reviewed / dismiss) — admin_bulk_update_reports.
--   2. Уведомление юзеру при модерации (бан/удаление) — admin_notify_user.
--      Вставка строки в notifications запускает существующий триггер OneSignal-пуша,
--      поэтому отдельная отправка push не нужна (одно событие = одно уведомление).
--   3. Счётчик открытых (pending) жалоб для realtime-бейджа в сайдбаре —
--      admin_pending_reports_count + добавление reports в realtime-публикацию.
-- Все RPC — SECURITY DEFINER с проверкой роли (минимум moderator). Идемпотентно.
-- Зависит от phase3_admin_foundation.sql (has_role, admin_actions).

-- =====================================================================
-- 1. Bulk-смена статуса набора жалоб. Возвращает число обновлённых строк.
--    Используется и для группировки: все исходные reports одного таргета
--    закрываются одним вызовом, чтобы группа не теряла отдельные жалобы.
-- =====================================================================
create or replace function public.admin_bulk_update_reports(p_ids uuid[], p_status text)
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
    if p_status not in ('pending', 'reviewed', 'dismissed') then
        raise exception 'invalid_status';
    end if;

    update public.reports set status = p_status where id = any(p_ids);
    get diagnostics v_count = row_count;

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'bulk_update_reports', 'report', null,
            jsonb_build_object('status', p_status, 'count', v_count, 'ids', to_jsonb(p_ids)));

    return v_count;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 2. Уведомить юзера о модерационном действии. Вставляет строку в
--    notifications (триггер on_notification_created шлёт OneSignal-пуш).
--    p_kind: 'moderation_ban' | 'moderation_unban' | 'moderation_delete' | ...
--    p_content: уже локализованный текст (фронт строит на языке админа —
--    компромисс, т.к. язык получателя серверу здесь недоступен).
-- =====================================================================
create or replace function public.admin_notify_user(
    p_user_id uuid,
    p_kind    text,
    p_content text
) returns boolean as $$
begin
    if not public.has_role('moderator'::admin_role_type) then
        raise exception 'Access denied';
    end if;
    if p_user_id is null then
        return false;
    end if;

    insert into public.notifications (user_id, actor_id, type, content, is_read, created_at)
    values (p_user_id, null, coalesce(p_kind, 'moderation'), p_content, false, now());

    insert into public.admin_actions (admin_id, action, target_type, target_id, meta)
    values (auth.uid(), 'notify_user', 'user', p_user_id::text,
            jsonb_build_object('kind', p_kind));

    return true;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 3. Число открытых (pending) жалоб — для бейджа в сайдбаре.
-- =====================================================================
create or replace function public.admin_pending_reports_count()
returns int as $$
declare
    v_count int;
begin
    if not public.has_role('moderator'::admin_role_type) then
        return 0;
    end if;
    select count(*) into v_count from public.reports where status = 'pending';
    return coalesce(v_count, 0);
end;
$$ language plpgsql security definer;

-- Реалтайм-бейдж новых жалоб: добавляем reports в публикацию (idempotent).
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
    ) then
        alter publication supabase_realtime add table public.reports;
    end if;
end $$;
