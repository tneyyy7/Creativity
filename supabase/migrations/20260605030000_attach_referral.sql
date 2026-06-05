-- Migration: attach_referral
-- Надёжная привязка реферальной атрибуции к текущему пользователю.
-- Работает независимо от того, как создан профиль (клиентом или триггером):
-- дозаписывает referral_code/referrer_host только если они ещё ПУСТЫЕ
-- (first-touch, без перезаписи). Зависит от 20260605010000_referral_tracking.sql.

CREATE OR REPLACE FUNCTION public.set_my_referral(
    p_code TEXT default null,
    p_host TEXT default null
) RETURNS boolean AS $$
DECLARE
    v_code TEXT;
    v_host TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Нормализуем код так же, как клиент и реестр: a-z0-9_-, нижний регистр.
    v_code := nullif(left(lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9_-]', '', 'g')), 64), '');
    v_host := nullif(left(trim(coalesce(p_host, '')), 255), '');

    IF v_code IS NULL AND v_host IS NULL THEN
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

GRANT EXECUTE ON FUNCTION public.set_my_referral(text, text) TO authenticated;
