import { cleanProfile, enrichProfilesWithProData, supabase } from './core'

export async function fetchPostLikes(paintingId) {
  try {
    const { data, error } = await supabase
      .from('post_likes')
      .select('id, user_id, created_at')
      .eq('painting_id', paintingId)
      .order('created_at', { ascending: false })
    if (error) throw error
    if (!data || data.length === 0) return []

    // Fetch profiles for all user_ids
    const userIds = [...new Set(data.map(l => l.user_id))]
    const { data: rawProfiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, finished_work_count, specialization')
      .in('id', userIds)
    const enriched = await enrichProfilesWithProData((rawProfiles || []).map(p => cleanProfile(p)))
    const profileMap = {}
    enriched.forEach(p => { profileMap[p.id] = p })

    return data.map(l => ({ ...l, profiles: profileMap[l.user_id] || null }))
  } catch (e) {
    console.error('fetchPostLikes error:', e)
    return []
  }
}


export async function togglePostLike(paintingId, userId) {
  try {
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('painting_id', paintingId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('post_likes').delete().eq('id', existing.id)
      if (error) throw error
      return false
    } else {
      const { error } = await supabase.from('post_likes').insert({ painting_id: paintingId, user_id: userId })
      if (error) throw error
      return true
    }
  } catch (e) {
    console.error('togglePostLike error:', e)
    throw e
  }
}

// =============================================
// Post Comments
// =============================================


export async function fetchPostComments(paintingId) {
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select('id, content, created_at, parent_id, user_id')
      .eq('painting_id', paintingId)
      .order('created_at', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) return []

    const userIds = [...new Set(data.map(c => c.user_id))]
    const { data: rawProfiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, finished_work_count, specialization, is_verified')
      .in('id', userIds)
    const enriched = await enrichProfilesWithProData((rawProfiles || []).map(p => cleanProfile(p)))
    const profileMap = {}
    enriched.forEach(p => { profileMap[p.id] = p })

    return data.map(c => ({ ...c, profiles: profileMap[c.user_id] || null }))
  } catch (e) {
    console.error('fetchPostComments error:', e)
    return []
  }
}


export async function addPostComment(paintingId, userId, content, parentId = null) {
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ painting_id: paintingId, user_id: userId, content, parent_id: parentId })
      .select('id, content, created_at, parent_id, user_id')
      .single()
    if (error) throw error

    // Fetch the user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, finished_work_count, specialization, is_verified')
      .eq('id', userId)
      .single()

    const cleaned = cleanProfile(profile)
    const enriched = await enrichProfilesWithProData(cleaned)

    return { ...data, profiles: enriched || null }
  } catch (e) {
    console.error('addPostComment error:', e)
    throw e
  }
}


export async function deletePostComment(commentId) {
  try {
    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
    if (error) throw error
  } catch (e) {
    console.error('deletePostComment error:', e)
    throw e
  }
}

// =============================================
// Post Notifications (likes & comments on your paintings)
// =============================================


export async function fetchPostNotifications(userId) {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) throw error
    if (!notifications || notifications.length === 0) return []

    // Extract unique actor and painting IDs
    const actorIds = [...new Set(notifications.map(n => n.actor_id).filter(Boolean))]
    const paintingIds = [...new Set(notifications.map(n => n.painting_id).filter(Boolean))]

    // Parallel fetch and enrich actor profiles
    let actorMap = {}
    if (actorIds.length > 0) {
      const { data: rawProfiles, error: pError } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, finished_work_count')
        .in('id', actorIds)
      if (!pError && rawProfiles) {
        const enriched = await enrichProfilesWithProData(rawProfiles.map(p => cleanProfile(p)))
        actorMap = Object.fromEntries(enriched.map(p => [p.id, p]))
      }
    }

    // Fetch the full post fields needed by PostViewerModal. The author lookup depends
    // on user_id, and the info panel needs description/category/date.
    let paintingMap = {}
    if (paintingIds.length > 0) {
      const { data: paintings, error: ptError } = await supabase
        .from('paintings')
        .select('id, user_id, title, description, category, image_url, created_at, is_finished')
        .in('id', paintingIds)
      if (!ptError && paintings) {
        paintingMap = Object.fromEntries(paintings.map(p => [p.id, p]))
      }
    }

    // Map profiles and paintings back to notifications
    return notifications.map(n => ({
      ...n,
      actor: actorMap[n.actor_id] || null,
      painting: paintingMap[n.painting_id] || null
    }))
  } catch (e) {
    console.error('fetchPostNotifications error:', e)
    return []
  }
}


export async function markAllNotificationsAsRead(userId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (error) throw error
  } catch (e) {
    console.error('markAllNotificationsAsRead error:', e)
    throw e
  }
}


export async function deleteAllNotifications(userId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
    if (error) throw error
  } catch (e) {
    console.error('deleteAllNotifications error:', e)
    throw e
  }
}


export async function markNotificationAsRead(notifId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId)
    if (error) throw error
  } catch (e) {
    console.error('markNotificationAsRead error:', e)
  }
}

// =============================================
// Tags & Painting Tags
// =============================================


export async function fetchBookmarks(userId) {
  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*, painting:paintings(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    if (!data || data.length === 0) return []

    // Fetch and enrich profiles for all bookmarked paintings
    const userIds = [...new Set(data.map(d => d.painting?.user_id).filter(Boolean))]
    let profileMap = {}
    if (userIds.length > 0) {
      const { data: rawProfiles, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
      if (pError) throw pError
      const enriched = await enrichProfilesWithProData((rawProfiles || []).map(p => cleanProfile(p)))
      profileMap = Object.fromEntries(enriched.map(p => [p.id, p]))
    }

    return data.map(d => {
      if (d.painting) {
        return {
          ...d.painting,
          user: profileMap[d.painting.user_id] || null
        }
      }
      return null
    }).filter(Boolean)
  } catch (e) {
    console.error('fetchBookmarks error:', e)
    return []
  }
}


export async function toggleBookmark(userId, paintingId) {
  try {
    const { data: existing, error: checkError } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('painting_id', paintingId)
      .maybeSingle()

    if (checkError) throw checkError

    if (existing) {
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', existing.id)
      if (error) throw error
      return false // Unbookmarked
    } else {
      const { error } = await supabase
        .from('bookmarks')
        .insert({ user_id: userId, painting_id: paintingId })
      if (error) throw error
      return true // Bookmarked
    }
  } catch (e) {
    console.error('toggleBookmark error:', e)
    throw e
  }
}


export async function isBookmarked(userId, paintingId) {
  try {
    if (!userId || !paintingId) return false
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('painting_id', paintingId)
      .maybeSingle()
    if (error) throw error
    return !!data
  } catch (e) {
    console.error('isBookmarked error:', e)
    return false
  }
}

