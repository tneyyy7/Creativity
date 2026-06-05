-- Migration phase3_admin_foundation.sql
-- Создание инфраструктуры ролей администраторов и лога действий

-- 1. Создаем enum для ролей админов
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role_type') THEN
        CREATE TYPE admin_role_type AS ENUM ('moderator', 'admin', 'superadmin');
    END IF;
END$$;

-- 2. Добавляем колонку admin_role в profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_role admin_role_type;

-- Для обратной совместимости обновим admin_role на основе is_admin
UPDATE public.profiles SET admin_role = 'superadmin' WHERE is_admin = true AND admin_role IS NULL;

-- 3. Создаем таблицу для audit log (admin_actions)
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска по логам
CREATE INDEX IF NOT EXISTS admin_actions_admin_id_idx ON public.admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS admin_actions_action_idx ON public.admin_actions(action);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON public.admin_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON public.admin_actions(created_at);

-- RLS для admin_actions: только админы могут читать логи, никто не может их изменять с клиента
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_actions;
CREATE POLICY "Admins can view logs" ON public.admin_actions
    FOR SELECT USING (
        (SELECT admin_role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin') OR
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    );

-- Вставлять в логи можно только через функции SECURITY DEFINER, с клиента нельзя.
-- 4. Функция для логирования действий админов с проверкой прав
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS BOOLEAN AS $$
DECLARE
    v_admin_role admin_role_type;
    v_is_admin BOOLEAN;
BEGIN
    -- Проверка прав текущего юзера
    SELECT admin_role, is_admin INTO v_admin_role, v_is_admin 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF v_admin_role IS NULL AND v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Not authorized to perform admin actions';
    END IF;

    -- Логируем
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, meta)
    VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_meta);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper-функции для RLS политик без рекурсии
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_admin_role admin_role_type;
BEGIN
    SELECT is_admin, admin_role INTO v_is_admin, v_admin_role 
    FROM public.profiles 
    WHERE id = auth.uid();
    
    RETURN v_is_admin = true OR v_admin_role IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_role(req_role admin_role_type) RETURNS BOOLEAN AS $$
DECLARE
    v_admin_role admin_role_type;
    v_is_admin BOOLEAN;
BEGIN
    SELECT admin_role, is_admin INTO v_admin_role, v_is_admin 
    FROM public.profiles 
    WHERE id = auth.uid();

    -- Если есть старый is_admin, считаем его superadmin для совместимости
    IF v_is_admin = true AND v_admin_role IS NULL THEN
        RETURN TRUE;
    END IF;

    IF v_admin_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF req_role = 'moderator' THEN
        RETURN v_admin_role IN ('moderator', 'admin', 'superadmin');
    ELSIF req_role = 'admin' THEN
        RETURN v_admin_role IN ('admin', 'superadmin');
    ELSIF req_role = 'superadmin' THEN
        RETURN v_admin_role = 'superadmin';
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
