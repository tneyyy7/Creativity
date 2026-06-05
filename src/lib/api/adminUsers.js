import { supabase } from './core'

// Этап 3: управление пользователями. Все привилегированные операции идут через
// SECURITY DEFINER RPC (проверка роли в БД) или edge-функцию (service-role).
// Клиент не доверенный — гейтинг кнопок в UI это лишь косметика.

// Поиск/пагинация пользователей. Возвращает { total, users } или null при ошибке.
export async function adminSearchUsers({ search = '', limit = 25, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_search_users', {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    return data || { total: 0, users: [] }
  } catch (e) {
    console.error('adminSearchUsers error:', e)
    return null
  }
}

// Агрегированная статистика рефералов: разбивка по ref-кодам и доменам.
// Возвращает { codes, hosts, total_attributed, total_users } или null.
export async function adminReferralStats() {
  try {
    const { data, error } = await supabase.rpc('admin_referral_stats')
    if (error) throw error
    return data || { codes: [], hosts: [], total_attributed: 0, total_users: 0 }
  } catch (e) {
    console.error('adminReferralStats error:', e)
    return null
  }
}

// Создать реферальный код. Пустой code → сервер сгенерирует случайный.
// Возвращает { ok, code, label } или { ok:false, reason:'exists' }.
export async function adminCreateReferralCode({ code = '', label = '' } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_create_referral_code', {
      p_code: code || null, p_label: label || null,
    })
    if (error) throw error
    return data || { ok: false }
  } catch (e) {
    console.error('adminCreateReferralCode error:', e)
    return { ok: false, error: e.message }
  }
}

// Удалить реферальный код из реестра (атрибуция профилей сохраняется).
export async function adminDeleteReferralCode(code) {
  try {
    const { error } = await supabase.rpc('admin_delete_referral_code', { p_code: code })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminDeleteReferralCode error:', e)
    return { ok: false, error: e.message }
  }
}

// Список пользователей, пришедших по конкретному ref-коду (drill-down).
export async function adminReferralUsers({ code, limit = 50, offset = 0 }) {
  try {
    const { data, error } = await supabase.rpc('admin_referral_users', {
      p_code: code, p_limit: limit, p_offset: offset,
    })
    if (error) throw error
    return data || { total: 0, users: [] }
  } catch (e) {
    console.error('adminReferralUsers error:', e)
    return null
  }
}

// Карточка пользователя: профиль, email, подписка, агрегаты.
export async function adminGetUserDetails(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase.rpc('admin_get_user_details', { p_user_id: userId })
    if (error) throw error
    return data
  } catch (e) {
    console.error('adminGetUserDetails error:', e)
    return null
  }
}

// Назначить/снять админ-роль (только superadmin). role: '' снимает роль.
export async function adminSetRole(userId, role) {
  try {
    const { error } = await supabase.rpc('admin_set_role', { p_user_id: userId, p_role: role || '' })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminSetRole error:', e)
    return { ok: false, error: e.message }
  }
}

// Ручная выдача Pro на p_months месяцев (помечается source='manual').
export async function adminGrantPro(userId, months = 1) {
  try {
    const { error } = await supabase.rpc('admin_grant_pro', { p_user_id: userId, p_months: months })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminGrantPro error:', e)
    return { ok: false, error: e.message }
  }
}

// Снять ручной Pro. Stripe-подписки не трогает (вернёт reason='stripe_managed').
export async function adminRevokePro(userId) {
  try {
    const { data, error } = await supabase.rpc('admin_revoke_pro', { p_user_id: userId })
    if (error) throw error
    return data || { ok: false }
  } catch (e) {
    console.error('adminRevokePro error:', e)
    return { ok: false, error: e.message }
  }
}

// Жёсткое удаление аккаунта через edge-функцию (service-role + каскад auth.users).
export async function adminDeleteAccount(userId) {
  try {
    const { data, error } = await supabase.functions.invoke('admin_delete_user', {
      body: { userId },
    })
    if (error) {
      // edge-функция вернула non-2xx — пробуем достать текст ошибки.
      let msg = error.message
      try { msg = (await error.context?.json())?.error || msg } catch { /* ignore */ }
      return { ok: false, error: msg }
    }
    return data?.ok ? { ok: true } : { ok: false, error: data?.error || 'unknown' }
  } catch (e) {
    console.error('adminDeleteAccount error:', e)
    return { ok: false, error: e.message }
  }
}
