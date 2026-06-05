-- Migration: cleanup_wrong_referrals
-- Разовая очистка ошибочных реферальных атрибуций, проставленных багнутой
-- логикой (когда любой существующий пользователь, кликнув по ссылке,
-- записывался в счётчик). Снимаем referral_code/referrer_host у всех, кто
-- зарегистрировался РАНЬШЕ, чем появились реф-коды — такие записи не могли
-- быть настоящими переходами по ссылке. Реально новые регистрации
-- (созданные после появления кодов) сохраняются.

DO $$
DECLARE
    v_cutoff TIMESTAMPTZ;
BEGIN
    -- Момент появления первого реф-кода в реестре; если реестр пуст —
    -- считаем, что легитимных переходов ещё не было, и берём «сейчас».
    SELECT COALESCE(min(created_at), now()) - interval '5 minutes'
    INTO v_cutoff
    FROM public.referral_codes;

    UPDATE public.profiles p
    SET referral_code = NULL,
        referrer_host = NULL
    FROM auth.users u
    WHERE u.id = p.id
      AND (p.referral_code IS NOT NULL OR p.referrer_host IS NOT NULL)
      AND (u.created_at IS NULL OR u.created_at < v_cutoff);
END$$;
