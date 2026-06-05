import { supabase } from './core'
import { fetchProfile } from './profile'

export async function fetchBlockedIds(userId) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId)
    if (error) throw error
    return (data || []).map(r => r.blocked_id)
  } catch (e) {
    // Table may not exist yet (migration not applied) — degrade gracefully.
    console.error('fetchBlockedIds error:', e)
    return []
  }
}


export async function blockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId || blockerId === blockedId) return false
  try {
    const { error } = await supabase
      .from('blocked_users')
      .insert({ blocker_id: blockerId, blocked_id: blockedId })
    if (error && error.code !== '23505') throw error // ignore duplicate
    return true
  } catch (e) {
    console.error('blockUser error:', e)
    return false
  }
}


export async function unblockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
    if (error) throw error
    return true
  } catch (e) {
    console.error('unblockUser error:', e)
    return false
  }
}


export async function isUserBlocked(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false
  try {
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle()
    return !!data
  } catch (e) {
    return false
  }
}

// Files a report against a post, user, or comment.
// Returns { ok: true } or { ok: false, alreadyReported?, error? }.

export async function reportContent({ reporterId, targetType, targetId, reason, details = null }) {
  if (!reporterId || !targetType || !targetId || !reason) {
    return { ok: false, error: 'missing_fields' }
  }
  try {
    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
        details
      })
    if (error) {
      // Unique partial index — user already has an open report on this target.
      if (error.code === '23505') return { ok: false, alreadyReported: true }
      throw error
    }
    return { ok: true }
  } catch (e) {
    console.error('reportContent error:', e)
    return { ok: false, error: e.message }
  }
}

// =============================================
// Phase 1.2b: Admin moderation panel
// =============================================

// Lightweight admin check — kept separate from fetchProfile so a missing
// is_admin column (migration not applied) never breaks the main profile load.

export async function fetchIsAdmin(userId) {
  if (!userId) return false
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single()
    if (error) return false
    return !!data?.is_admin
  } catch {
    return false
  }
}

// Ids of globally banned users — hidden from every feed/explore list.

export async function fetchBannedIds() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_banned', true)
    if (error) throw error
    return (data || []).map(r => r.id)
  } catch (e) {
    return []
  }
}

// Admin: report queue, enriched with reporter + target previews in bulk.

export async function fetchReports(status = 'pending') {
  try {
    let query = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (status && status !== 'all') query = query.eq('status', status)

    const { data: reports, error } = await query
    if (error) throw error
    if (!reports || reports.length === 0) return []

    // Collect ids per target type for batched lookups.
    const reporterIds = [...new Set(reports.map(r => r.reporter_id))]
    const postIds = [...new Set(reports.filter(r => r.target_type === 'post').map(r => r.target_id))]
    const userIds = [...new Set(reports.filter(r => r.target_type === 'user').map(r => r.target_id))]
    const commentIds = [...new Set(reports.filter(r => r.target_type === 'comment').map(r => r.target_id))]

    const [reportersRes, postsRes, usersRes, commentsRes] = await Promise.all([
      reporterIds.length
        ? supabase.from('profiles').select('id, nickname, avatar_url').in('id', reporterIds)
        : Promise.resolve({ data: [] }),
      postIds.length
        ? supabase.from('paintings').select('id, title, image_url, user_id, is_nsfw').in('id', postIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from('profiles').select('id, nickname, avatar_url, is_banned').in('id', userIds)
        : Promise.resolve({ data: [] }),
      commentIds.length
        ? supabase.from('post_comments').select('id, content, user_id, painting_id').in('id', commentIds)
        : Promise.resolve({ data: [] }),
    ])

    const byId = (arr) => Object.fromEntries((arr || []).map(x => [x.id, x]))
    const reporters = byId(reportersRes.data)
    const posts = byId(postsRes.data)
    const users = byId(usersRes.data)
    const comments = byId(commentsRes.data)

    return reports.map(r => {
      let target = null
      if (r.target_type === 'post') target = posts[r.target_id] || null
      else if (r.target_type === 'user') target = users[r.target_id] || null
      else if (r.target_type === 'comment') target = comments[r.target_id] || null
      return { ...r, reporter: reporters[r.reporter_id] || null, target }
    })
  } catch (e) {
    console.error('fetchReports error:', e)
    return []
  }
}


export async function updateReportStatus(reportId, status) {
  try {
    const { error } = await supabase
      .from('reports')
      .update({ status })
      .eq('id', reportId)
    if (error) throw error
    return true
  } catch (e) {
    console.error('updateReportStatus error:', e)
    return false
  }
}

// Admin content takedown (relies on the admin RLS delete policies).

export async function adminDeletePainting(id) {
  try {
    const { error } = await supabase.from('paintings').delete().eq('id', id)
    if (error) throw error
    return true
  } catch (e) {
    console.error('adminDeletePainting error:', e)
    return false
  }
}


export async function adminDeleteComment(id) {
  try {
    const { error } = await supabase.from('post_comments').delete().eq('id', id)
    if (error) throw error
    return true
  } catch (e) {
    console.error('adminDeleteComment error:', e)
    return false
  }
}


export async function setUserBanned(userId, banned) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: banned })
      .eq('id', userId)
    if (error) throw error
    return true
  } catch (e) {
    console.error('setUserBanned error:', e)
    return false
  }
}

// =============================================
// Phase 6: Reports queue QoL (bulk, notify, badge)
// =============================================
// Привилегированные операции идут через SECURITY DEFINER RPC (проверка роли в БД).

// Пакетная смена статуса жалоб. Возвращает { ok, count }.
export async function adminBulkUpdateReports(ids, status) {
  if (!ids?.length) return { ok: true, count: 0 }
  try {
    const { data, error } = await supabase.rpc('admin_bulk_update_reports', { p_ids: ids, p_status: status })
    if (error) throw error
    return { ok: true, count: data ?? 0 }
  } catch (e) {
    console.error('adminBulkUpdateReports error:', e)
    return { ok: false, error: e.message }
  }
}

// Уведомить юзера о модерационном действии (вставка notifications → OneSignal-пуш).
// Не должно ронять само действие — best-effort.
export async function adminNotifyUser(userId, kind, content) {
  if (!userId) return { ok: false }
  try {
    const { error } = await supabase.rpc('admin_notify_user', {
      p_user_id: userId, p_kind: kind, p_content: content,
    })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminNotifyUser error:', e)
    return { ok: false, error: e.message }
  }
}

// Число открытых жалоб для бейджа в сайдбаре. Возвращает 0 при ошибке/без роли.
export async function fetchPendingReportsCount() {
  try {
    const { data, error } = await supabase.rpc('admin_pending_reports_count')
    if (error) throw error
    return data ?? 0
  } catch (e) {
    return 0
  }
}

// =============================================
// Phase 4: Admin content & tag management
// =============================================
// Все привилегированные операции идут через SECURITY DEFINER RPC (проверка роли
// в БД). Клиент не доверенный — гейтинг кнопок в UI это лишь косметика.

// Лента контента (посты/истории) с фильтрами и серверной пагинацией.
// type: 'post' | 'story'. nsfw: 'all' | 'nsfw' | 'sfw'. Возвращает { total, items } или null.
export async function adminListContent({ type = 'post', search = '', author = null, nsfw = 'all', limit = 24, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_list_content', {
      p_type: type,
      p_search: search || null,
      p_author: author || null,
      p_nsfw: nsfw,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    return data || { total: 0, items: [] }
  } catch (e) {
    console.error('adminListContent error:', e)
    return null
  }
}

// Переключить NSFW-флаг одного поста.
export async function adminSetNsfw(paintingId, value) {
  try {
    const { error } = await supabase.rpc('admin_set_nsfw', { p_id: paintingId, p_value: value })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminSetNsfw error:', e)
    return { ok: false, error: e.message }
  }
}

// Пакетно переключить NSFW для набора постов.
export async function adminBulkSetNsfw(ids, value) {
  if (!ids?.length) return { ok: true, count: 0 }
  try {
    const { data, error } = await supabase.rpc('admin_bulk_set_nsfw', { p_ids: ids, p_value: value })
    if (error) throw error
    return { ok: true, count: data ?? 0 }
  } catch (e) {
    console.error('adminBulkSetNsfw error:', e)
    return { ok: false, error: e.message }
  }
}

// Извлекает storage-путь внутри бакета 'paintings' из публичного URL.
// Посты и истории живут в одном бакете 'paintings'.
function storagePathFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const marker = '/storage/v1/object/public/paintings/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  try { return decodeURIComponent(url.slice(i + marker.length)) } catch { return url.slice(i + marker.length) }
}

// Удаляет файлы из бакета 'paintings' по их публичным URL (best-effort, чанками).
async function removeStorageFiles(urls) {
  const paths = (urls || []).map(storagePathFromUrl).filter(Boolean)
  if (!paths.length) return
  for (let i = 0; i < paths.length; i += 100) {
    try {
      await supabase.storage.from('paintings').remove(paths.slice(i, i + 100))
    } catch (e) {
      // Чистка Storage не должна ронять основную операцию удаления.
      console.error('removeStorageFiles error:', e)
    }
  }
}

// Bulk-удаление постов. RPC удаляет строки и возвращает URL файлов — чистим Storage.
export async function adminBulkDeletePaintings(ids) {
  if (!ids?.length) return { ok: true, deleted: 0 }
  try {
    const { data, error } = await supabase.rpc('admin_bulk_delete_paintings', { p_ids: ids })
    if (error) throw error
    await removeStorageFiles(data?.image_urls)
    return { ok: true, deleted: data?.deleted ?? 0 }
  } catch (e) {
    console.error('adminBulkDeletePaintings error:', e)
    return { ok: false, error: e.message }
  }
}

// Bulk-удаление историй (тот же бакет 'paintings').
export async function adminBulkDeleteStories(ids) {
  if (!ids?.length) return { ok: true, deleted: 0 }
  try {
    const { data, error } = await supabase.rpc('admin_bulk_delete_stories', { p_ids: ids })
    if (error) throw error
    await removeStorageFiles(data?.image_urls)
    return { ok: true, deleted: data?.deleted ?? 0 }
  } catch (e) {
    console.error('adminBulkDeleteStories error:', e)
    return { ok: false, error: e.message }
  }
}

// Список тегов с usage/followers. Возвращает { total, tags } или null.
export async function adminListTags({ search = '', limit = 50, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_list_tags', {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    return data || { total: 0, tags: [] }
  } catch (e) {
    console.error('adminListTags error:', e)
    return null
  }
}

// Переименовать тег. reason='tag_exists' — имя занято (UI предложит мерж).
export async function adminRenameTag(tagId, newName) {
  try {
    const { error } = await supabase.rpc('admin_rename_tag', { p_tag_id: tagId, p_new_name: newName })
    if (error) {
      if (/tag_exists/.test(error.message || '')) return { ok: false, reason: 'tag_exists' }
      if (/empty_name/.test(error.message || '')) return { ok: false, reason: 'empty_name' }
      throw error
    }
    return { ok: true }
  } catch (e) {
    console.error('adminRenameTag error:', e)
    return { ok: false, error: e.message }
  }
}

// Слить тег sourceId в targetId (переписывает painting_tags + tag_follows).
export async function adminMergeTags(sourceId, targetId) {
  try {
    const { error } = await supabase.rpc('admin_merge_tags', { p_source_id: sourceId, p_target_id: targetId })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminMergeTags error:', e)
    return { ok: false, error: e.message }
  }
}

// Удалить тег (бан спам-тега).
export async function adminDeleteTag(tagId) {
  try {
    const { error } = await supabase.rpc('admin_delete_tag', { p_tag_id: tagId })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('adminDeleteTag error:', e)
    return { ok: false, error: e.message }
  }
}

// =============================================
// Wave 2: Collections (Коллекции / Альбомы)
// =============================================

