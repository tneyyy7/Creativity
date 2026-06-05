-- Migration: referral_new_users_only
-- Фикс: реферал должен засчитываться ТОЛЬКО новым регистрациям, а не давно
-- зарегистрированным пользователям, которые случайно перешли по ссылке.
-- Атрибуция применяется, лишь если аккаунт создан в момент клика по ссылке
-- или позже (p_captured_at). Без метки времени — консервативный фолбэк:
-- только аккаунты не старше 1 часа. Переопределяет функцию из
-- 20260605030000_attach_referral.sql.

-- Убираем прежнюю 2-аргументную версию, чтобы не было перегрузки/неоднозначности.
DROP FUNCTION IF EXISTS public.set_my_referral(text, text);

CREATE OR REPLACE FUNCTION public.set_my_referral(
    p_code TEXT default null,
    p_host TEXT default null,
    p_captured_at TIMESTAMPTZ default null
) RETURNS boolean AS $$
DECLARE
    v_code TEXT;
    v_host TEXT;
    v_created_at TIMESTAMPTZ;
    v_threshold TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_code := nullif(left(lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9_-]', '', 'g')), 64), '');
    v_host := nullif(left(trim(coalesce(p_host, '')), 255), '');

    IF v_code IS NULL AND v_host IS NULL THEN
        RETURN false;
    END IF;

    -- Когда был создан аккаунт текущего пользователя.
    SELECT created_at INTO v_created_at FROM auth.users WHERE id = auth.uid();

    -- Порог «новизны»: момент клика по ссылке (с небольшим допуском на
    -- рассинхрон часов), либо «не старше часа», если метки нет.
    IF p_captured_at IS NOT NULL THEN
        v_threshold := p_captured_at - interval '5 minutes';
    ELSE
        v_threshold := now() - interval '1 hour';
    END IF;

    -- Давно зарегистрированный пользователь — не атрибутируем, выходим.
    IF v_created_at IS NULL OR v_created_at < v_threshold THEN
        RETURN false;
    END IF;

    -- Заполняем только пустые поля — первое касание не перезаписывается.
    UPDATE public.profiles
    SET referral_code = COALESCE(referral_code, v_code),
        referrer_host = COALESCE(referrer_host, v_host)
    WHERE id = auth.uid()
      AND (referral_code IS NULL OR referrer_host IS NULL);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_my_referral(text, text, timestamptz) TO authenticated;
