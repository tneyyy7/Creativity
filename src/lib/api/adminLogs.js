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
 * Получает роль администратора для текущего пользователя.
 * Возвращает объект: { isAdmin: boolean, role: 'moderator'|'admin'|'superadmin'|null }
 */
export async function fetchAdminRole(userId) {
  if (!userId) return { isAdmin: false, role: null }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin, admin_role')
      .eq('id', userId)
      .single()
      
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
