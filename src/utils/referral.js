// Реферальная атрибуция (first-touch).
//
// Когда новый посетитель приходит по кастомной ссылке друга (?ref=код) или с
// внешнего сайта, мы запоминаем источник в localStorage — он переживёт
// OAuth-редирект и подтверждение email. При создании профиля источник
// записывается в БД (см. App.jsx). Перезапись запрещена: первое касание
// фиксируется навсегда, чтобы более поздние визиты не подменяли атрибуцию.

const CODE_KEY = 'creativity_ref_code'
const HOST_KEY = 'creativity_ref_host'
const TS_KEY = 'creativity_ref_ts'

// Нормализуем код: латиница/цифры/-/_ до 64 символов, в нижнем регистре.
const sanitizeCode = (raw) =>
  String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64)

// Хост внешнего источника (document.referrer), кроме переходов внутри сайта.
const externalHost = () => {
  try {
    if (!document.referrer) return null
    const ref = new URL(document.referrer)
    if (ref.host === window.location.host) return null
    return ref.host
  } catch {
    return null
  }
}

/**
 * Считывает ?ref= из URL и домен-источник, сохраняет в localStorage (first-touch)
 * и убирает параметр ref из адресной строки, не трогая остальные параметры.
 * Безопасно вызывать на каждом старте приложения.
 *
 * Возвращает true, если в текущей загрузке URL присутствовал параметр ref —
 * по нему можно решить открыть экран регистрации (приглашение нового юзера).
 */
export function captureReferral() {
  try {
    const params = new URLSearchParams(window.location.search)
    const hadRef = params.has('ref')
    const code = sanitizeCode(params.get('ref'))

    if (code && !localStorage.getItem(CODE_KEY)) {
      localStorage.setItem(CODE_KEY, code)
      // Метка времени клика — атрибуция засчитывается только аккаунтам,
      // созданным в этот момент или позже (отсекает давно зарегистрированных).
      localStorage.setItem(TS_KEY, new Date().toISOString())
      const host = externalHost()
      if (host) localStorage.setItem(HOST_KEY, host)
    } else if (!localStorage.getItem(HOST_KEY)) {
      // Нет ref-кода, но есть внешний источник — фиксируем хотя бы домен.
      const host = externalHost()
      if (host) localStorage.setItem(HOST_KEY, host)
    }

    // Убираем ref из URL, чтобы он не торчал в адресе после захвата.
    if (params.has('ref')) {
      params.delete('ref')
      const qs = params.toString()
      const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
      window.history.replaceState({}, '', url)
    }

    return hadRef
  } catch (e) {
    console.error('captureReferral error:', e)
    return false
  }
}

/** Возвращает сохранённую атрибуцию: { code, host, ts } (значения или null). */
export function getReferral() {
  try {
    return {
      code: localStorage.getItem(CODE_KEY) || null,
      host: localStorage.getItem(HOST_KEY) || null,
      ts: localStorage.getItem(TS_KEY) || null,
    }
  } catch {
    return { code: null, host: null, ts: null }
  }
}

/** Сбрасывает сохранённую атрибуцию (после успешной записи в профиль). */
export function clearReferral() {
  try {
    localStorage.removeItem(CODE_KEY)
    localStorage.removeItem(HOST_KEY)
    localStorage.removeItem(TS_KEY)
  } catch { /* ignore */ }
}
