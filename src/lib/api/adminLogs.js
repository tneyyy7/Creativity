import { supabase } from './core'

/**
 * Записывает действие администратора в аудит-лог.
 * Требует наличия прав администратора (is_admin=true или admin_role).
 */
export async function logAdminAction(action, targetType, targetId, meta = {}) {
  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_meta: meta
    })
    
    if (error) {
      console.error('Failed to log admin action:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('logAdminAction exception:', e)
    return false
  }
}

/**
 * Возвращает страницу audit-лога с присоединёнными данными админа.
 * Возвращает { total, items } или null при ошибке.
 */
export async function adminListLogs({ search = '', action = '', targetType = '', limit = 50, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_list_logs', {
      p_search: search || null,
      p_action: action || null,
      p_target_type: targetType || null,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    return { total: data?.total ?? 0, items: data?.items ?? [] }
  } catch (e) {
    console.error('adminListLogs error:', e)
    return null
  }
}

/**
 * Возвращает уникальные значения action и target_type для фильтров.
 * Возвращает { actions: [], targets: [] }.
 */
export async function adminLogFacets() {
  try {
    const { data, error } = await supabase.rpc('admin_log_facets')
    if (error) throw error
    return { actions: data?.actions ?? [], targets: data?.targets ?? [] }
  } catch (e) {
    console.error('adminLogFacets error:', e)
    return { actions: [], targets: [] }
  }
}

/**
 * Получает роль администратора для текущего пользователя.
 * Возвращает объект: { isAdmin: boolean, role: 'moderator'|'admin'|'superadmin'|null }
 */
export async function fetchAdminRole(userId) {
  if (!userId) return { isAdmin: false, role: null }
  try {
    let { data, error } = await supabase
      .from('profiles')
      .select('is_admin, admin_role')
      .eq('id', userId)
      .single()

    // Graceful degrade: колонка admin_role может не существовать (миграция не
    // применена) — не роняем гейтинг, фолбэк на старый булев is_admin.
    if (error && (error.code === '42703' || /admin_role/.test(error.message || ''))) {
      const res = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single()
      data = res.data
      error = res.error
    }

    if (error) throw error

    // Если есть admin_role - используем её, иначе фолбэк на is_admin
    if (data?.admin_role) {
      return { isAdmin: true, role: data.admin_role }
    }

    if (data?.is_admin) {
      return { isAdmin: true, role: 'superadmin' } // Legacy compatibility
    }

    return { isAdmin: false, role: null }
  } catch (e) {
    console.error('fetchAdminRole error:', e)
    return { isAdmin: false, role: null }
  }
}
