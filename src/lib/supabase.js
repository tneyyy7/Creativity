import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing')
console.log('Supabase Key:', supabaseAnonKey ? 'Found' : 'Missing')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('Supabase client initialized')

export const convertHeicToJpeg = async (file) => {
  try {
    const nameLower = file.name.toLowerCase();
    const hasHeicExtension = nameLower.endsWith('.heic') || nameLower.endsWith('.heif');

    // 1. If the browser (e.g. Safari on macOS/iOS) already converted the file to standard format, 
    // but kept the .HEIC filename extension, just rename the extension to match the mime type.
    const isAlreadyStandard = file.type && (
      file.type.startsWith('image/jpeg') ||
      file.type.startsWith('image/png') ||
      file.type.startsWith('image/gif') ||
      file.type.startsWith('image/webp')
    );

    if (hasHeicExtension && isAlreadyStandard) {
      console.log("File has HEIC extension but is already standard type:", file.type);
      const ext = file.type.split('/').pop() || 'jpg';
      const newName = file.name.replace(/\.(heic|heif)$/i, `.${ext === 'jpeg' ? 'jpg' : ext}`);
      return new File([file], newName, { type: file.type });
    }

    // Load heic-to dynamically
    const { heicTo, isHeic: checkIsHeic } = await import('heic-to');

    // Slice file to convert it to a pure Blob, ensuring compatibility
    const cleanBlob = file.slice(0, file.size, file.type);

    // Verify if it is really a HEIC file (by checking binary headers)
    const isRealHeic = await checkIsHeic(cleanBlob);

    if (!isRealHeic) {
      if (hasHeicExtension) {
        console.log("File has HEIC extension but is not a real HEIF file. Renaming to .jpg...");
        const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
        return new File([file], newName, { type: 'image/jpeg' });
      }
      return file;
    }

    console.log("Real HEIC file detected. Converting to JPEG...");
    const jpegBlob = await heicTo({
      blob: cleanBlob,
      type: 'image/jpeg',
      quality: 0.8
    });

    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([jpegBlob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error("HEIC conversion failed:", err);
    alert("Ошибка конвертации HEIC: " + (err.message || err) + ". Файл будет загружен без изменений.");
    return file;
  }
}

export const uploadPainting = async (file, userId) => {
  const processedFile = await convertHeicToJpeg(file)

  // Normalize filename: remove special characters, spaces to dashes, etc.
  const cleanName = processedFile.name
    .replace(/[^\x00-\x7F]/g, "") // remove non-ascii
    .replace(/\s+/g, '-')         // spaces to dashes
    .replace(/[^a-zA-Z0-9.-]/g, '') // remove anything not alphanumeric, dot or dash

  const fileName = `${userId}/${Date.now()}-${cleanName || 'image'}`
  const { data, error } = await supabase.storage
    .from('paintings')
    .upload(fileName, processedFile)

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from('paintings')
    .getPublicUrl(fileName)

  return publicUrl
}

// Helper to clean profile data and handle missing columns
function cleanProfile(data) {
  if (!data) return null
  if (Array.isArray(data)) return data.map(cleanProfile)
  return {
    ...data,
    finished_work_count: data.finished_work_count || 0,
    specialization: data.specialization || null,
    last_seen: data.last_seen || null
  }
}

export async function fetchProfile(userId) {
  try {
    // Stage 1: Try full fetch
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count, specialization')
      .eq('id', userId)
      .single()

    if (!error) return cleanProfile(data)

    // Stage 2: Fallback (removing specialization and count if they cause errors)
    console.warn("Retrying profile fetch without extra columns...")
    const { data: retry, error: rError } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, bio, is_private, is_verified, specialization')
      .eq('id', userId)
      .single()

    if (rError) {
      if (rError.code !== 'PGRST116') throw rError
      return null
    }
    return cleanProfile(retry)
  } catch (e) {
    console.error("fetchProfile error:", e)
    return null
  }
}

export const upsertProfile = async (profile) => {
  // Only include fields that are explicitly provided to avoid overwriting existing DB values with null
  const profileData = { id: profile.id, updated_at: new Date().toISOString() }
  if (profile.nickname !== undefined) profileData.nickname = profile.nickname
  if (profile.avatar_url !== undefined) profileData.avatar_url = profile.avatar_url
  if (profile.bio !== undefined) profileData.bio = profile.bio
  if (profile.is_private !== undefined) profileData.is_private = profile.is_private
  if (profile.is_verified !== undefined) profileData.is_verified = profile.is_verified
  if (profile.specialization !== undefined) profileData.specialization = profile.specialization

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profileData)
    .select()
    .single()

  if (error) throw error
  return data
}

export const fetchPaintings = async (userId) => {
  const { data, error } = await supabase
    .from('paintings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export const savePaintingMetadata = async (painting) => {
  const { data, error } = await supabase
    .from('paintings')
    .insert({
      ...painting,
      is_finished: painting.is_finished || false,
      is_ai_generated: painting.is_ai_generated || false
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export const deletePainting = async (id) => {
  const { error } = await supabase
    .from('paintings')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export const uploadAvatar = async (file, userId) => {
  const processedFile = await convertHeicToJpeg(file)
  const fileExt = processedFile.name.split('.').pop()
  const fileName = `${userId}/${Math.random()}.${fileExt}`
  const filePath = `${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, processedFile)

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  return publicUrl
}

// --- FRIENDSHIP & PUBLIC PROFILE LOGIC ---

export const searchUsers = async (query, currentUserId) => {
  if (!query) return []
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization')
      .ilike('nickname', `%${query}%`)
      .neq('id', currentUserId)
      .limit(10)

    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, is_verified, specialization')
        .ilike('nickname', `%${query}%`)
        .neq('id', currentUserId)
        .limit(10)
      return cleanProfile(retry)
    }
    if (error) throw error
    return cleanProfile(data)
  } catch (e) {
    console.error("searchUsers error:", e)
    return []
  }
}

export const fetchPublicProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count, specialization')
      .eq('id', userId)
      .single()
    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('nickname, avatar_url, bio, is_private, is_verified, specialization')
        .eq('id', userId)
        .single()
      return cleanProfile(retry)
    }
    if (error) throw error
    return cleanProfile(data)
  } catch (e) {
    console.error("fetchPublicProfile error:", e)
    return null
  }
}

export const checkFriendshipStatus = async (user1, user2) => {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data // returns null if no relationship exists
}

export const sendFriendRequest = async (senderId, receiverId) => {
  const { error } = await supabase
    .from('friendships')
    .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })

  if (error) throw error
}

export const respondToFriendRequest = async (requestId, status) => {
  if (status === 'rejected') {
    const { error } = await supabase.from('friendships').delete().eq('id', requestId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', requestId)
    if (error) throw error
  }
}

export const removeFriend = async (friendshipId) => {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) throw error
}

export const fetchFriends = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        status,
        sender_id,
        receiver_id,
        sender:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen),
        receiver:profiles!friendships_receiver_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted')

    if (error) {
      if (error.message?.includes('relationship') || error.message?.includes('fkey')) {
        const { data: relations, error: relError } = await supabase
          .from('friendships')
          .select('id, sender_id, receiver_id, status')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .eq('status', 'accepted')

        if (relError || !relations) return []

        const profileIds = [...new Set(relations.flatMap(r => [r.sender_id, r.receiver_id]))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen')
          .in('id', profileIds)

        const profileMap = Object.fromEntries(profiles?.map(p => [p.id, p]) || [])

        return relations.map(r => {
          const friendId = r.sender_id === userId ? r.receiver_id : r.sender_id
          const profile = profileMap[friendId]
          return { ...r, profile: cleanProfile(profile) }
        })
      }
      throw error
    }

    return data?.map(f => {
      const friendProfile = f.sender_id === userId ? f.receiver : f.sender
      const friendProfileParsed = friendProfile && Array.isArray(friendProfile) ? friendProfile[0] : friendProfile
      return { ...f, profile: cleanProfile(friendProfileParsed) }
    }) || []
  } catch (e) {
    console.error("fetchFriends error:", e)
    return []
  }
}

export const fetchPendingRequests = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        sender_id,
        profile:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count, specialization)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending')

    if (error) {
      if (error.message?.includes('relationship') || error.message?.includes('fkey')) {
        const { data: requests, error: reqError } = await supabase
          .from('friendships')
          .select('id, sender_id')
          .eq('receiver_id', userId)
          .eq('status', 'pending')

        if (reqError || !requests) return []

        const senderIds = requests.map(r => r.sender_id)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url, is_verified, finished_work_count')
          .in('id', senderIds)

        const profileMap = Object.fromEntries(profiles?.map(p => [p.id, p]) || [])

        return requests.map(r => ({
          ...r,
          profile: cleanProfile(profileMap[r.sender_id])
        }))
      }
      throw error
    }
    return data?.map(r => ({ ...r, profile: cleanProfile(r.profile) })) || []
  } catch (e) {
    console.error("fetchPendingRequests error:", e)
    return []
  }
}

export async function fetchProfileMinimal(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, is_verified, finished_work_count')
      .eq('id', userId)
      .single()

    if (error && error.message?.includes('finished_work_count')) {
      const { data: retryData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, is_verified')
        .eq('id', userId)
        .single()
      return cleanProfile(retryData)
    }
    if (error) throw error
    return cleanProfile(data)
  } catch (e) {
    console.error("fetchProfileMinimal error:", e)
    return null
  }
}

// --- MESSAGING LOGIC ---

export const sendMessage = async (senderId, receiverId, content, replyToId = null) => {
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      reply_to_id: replyToId
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

export const fetchMessages = async (userId, otherId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export const fetchConversations = async (userId) => {
  try {
    // Get all messages where user is sender or receiver to find conversation partners
    const { data: messages, error: mError } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, created_at, is_read')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (mError) throw mError
    if (!messages || messages.length === 0) return []

    // Group by other user and store last message timestamp + unread count
    const conversationMap = new Map()

    messages.forEach(m => {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          last_message_at: m.created_at,
          unread_count: 0
        })
      }

      // Increment unread count if message is to current user and unread
      if (m.receiver_id === userId && !m.is_read) {
        conversationMap.get(otherId).unread_count++
      }
    })

    const otherUserIds = Array.from(conversationMap.keys())

    // Fetch profiles for these users
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen')
      .in('id', otherUserIds)

    if (pError) throw pError

    // Combine profiles with conversation metadata and sort
    return profiles
      .map(p => ({
        ...cleanProfile(p),
        unread_count: conversationMap.get(p.id).unread_count,
        last_message_at: conversationMap.get(p.id).last_message_at
      }))
      .sort((a, b) => new Map(conversationMap).get(b.id).last_message_at.localeCompare(conversationMap.get(a.id).last_message_at))
  } catch (err) {
    console.error("fetchConversations error:", err)
    return []
  }
}

export const fetchTotalUnreadCount = async (userId) => {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (error) throw error
    return count || 0
  } catch (err) {
    console.error("fetchTotalUnreadCount error:", err)
    return 0
  }
}

export const markAsRead = async (receiverId, senderId) => {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', receiverId)
    .eq('sender_id', senderId)
    .eq('is_read', false)

  if (error) throw error
}

export const deleteMessage = async (id) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export const updateMessage = async (id, content) => {
  const { data, error } = await supabase
    .from('messages')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}



export const searchFriends = async (query, currentUserId) => {
  if (!query) return []
  try {
    // 1. Fetch accepted friendships for current user to get friend IDs
    const { data: friendships, error: fError } = await supabase
      .from('friendships')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .eq('status', 'accepted')

    if (fError || !friendships) return []

    const friendIds = friendships.map(f => f.sender_id === currentUserId ? f.receiver_id : f.sender_id)
    if (friendIds.length === 0) return []

    // 2. Search profiles only among these friend IDs
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization')
      .ilike('nickname', `%${query}%`)
      .in('id', friendIds)
      .limit(10)

    if (pError && pError.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, is_verified, specialization')
        .ilike('nickname', `%${query}%`)
        .in('id', friendIds)
        .limit(10)
      return (retry || []).map(p => ({
        ...p,
        nickname: p.nickname || 'Unknown Artist',
        avatar_url: p.avatar_url || null,
        is_verified: p.is_verified || false
      }))
    }
    if (pError) throw pError
    return (profiles || []).map(p => ({
      ...p,
      nickname: p.nickname || 'Unknown Artist',
      avatar_url: p.avatar_url || null,
      is_verified: p.is_verified || false
    }))
  } catch (e) {
    console.error("searchFriends error:", e)
    return []
  }
}

// =============================================
// Post Likes
// =============================================

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
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, finished_work_count, specialization')
      .in('id', userIds)
    const profileMap = {}
      ; (profiles || []).forEach(p => { profileMap[p.id] = p })

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
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, finished_work_count, specialization')
      .in('id', userIds)
    const profileMap = {}
      ; (profiles || []).forEach(p => { profileMap[p.id] = p })

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
      .select('id, nickname, avatar_url, finished_work_count')
      .eq('id', userId)
      .single()

    return { ...data, profiles: profile || null }
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

    // Parallel fetch actor profiles
    let actorMap = {}
    if (actorIds.length > 0) {
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', actorIds)
      if (!pError && profiles) {
        actorMap = Object.fromEntries(profiles.map(p => [p.id, p]))
      }
    }

    // Parallel fetch paintings
    let paintingMap = {}
    if (paintingIds.length > 0) {
      const { data: paintings, error: ptError } = await supabase
        .from('paintings')
        .select('id, title, image_url')
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

export async function fetchAllTags() {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  } catch (e) {
    console.error('fetchAllTags error:', e)
    return []
  }
}

export async function fetchPaintingTags(paintingId) {
  try {
    const { data, error } = await supabase
      .from('painting_tags')
      .select('tag:tags(id, name)')
      .eq('painting_id', paintingId)
    if (error) throw error
    return data?.map(d => d.tag) || []
  } catch (e) {
    console.error('fetchPaintingTags error:', e)
    return []
  }
}

export async function savePaintingTags(paintingId, tagNames) {
  try {
    // 1. Delete all existing tags for this painting first
    const { error: deleteError } = await supabase
      .from('painting_tags')
      .delete()
      .eq('painting_id', paintingId)

    if (deleteError) throw deleteError

    if (!tagNames || tagNames.length === 0) return

    // 2. Clean and deduplicate tag names
    const cleanTags = [...new Set(tagNames.map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(t => t.length > 0))]
    if (cleanTags.length === 0) return

    // 3. For each tag, upsert it to ensure it exists in 'tags' table
    const tagIds = []
    for (const tagName of cleanTags) {
      let { data: existingTag } = await supabase
        .from('tags')
        .select('id')
        .eq('name', tagName)
        .maybeSingle()

      if (!existingTag) {
        const { data: newTag, error: insertError } = await supabase
          .from('tags')
          .insert({ name: tagName })
          .select('id')
          .single()

        if (insertError && insertError.code === '23505') {
          const { data: retryTag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName)
            .maybeSingle()
          if (retryTag) {
            tagIds.push(retryTag.id)
          }
        } else if (newTag) {
          tagIds.push(newTag.id)
        }
      } else {
        tagIds.push(existingTag.id)
      }
    }

    // 4. Insert new relations
    if (tagIds.length > 0) {
      const relations = tagIds.map(tagId => ({
        painting_id: paintingId,
        tag_id: tagId
      }))
      const { error: relError } = await supabase
        .from('painting_tags')
        .insert(relations)
      if (relError) throw relError
    }
  } catch (e) {
    console.error('savePaintingTags error:', e)
    throw e
  }
}

// =============================================
// Bookmarks
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

    // Fetch profiles for all bookmarked paintings
    const userIds = [...new Set(data.map(d => d.painting?.user_id).filter(Boolean))]
    let profileMap = {}
    if (userIds.length > 0) {
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
      if (pError) throw pError
      profileMap = Object.fromEntries((profiles || []).map(p => [p.id, cleanProfile(p)]))
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

// =============================================
// Online Status
// =============================================

export async function updateLastSeen(userId) {
  try {
    if (!userId) return
    const { error } = await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', userId)
    if (error) throw error
  } catch (e) {
    console.error('updateLastSeen error:', e)
  }
}

// =============================================
// Follows
// =============================================

export async function toggleFollow(followerId, followingId) {
  try {
    const { data: existing, error: checkError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle()

    if (checkError) throw checkError

    if (existing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('id', existing.id)
      if (error) throw error
      return false // Unfollowed
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: followerId, following_id: followingId })
      if (error) throw error
      return true // Followed
    }
  } catch (e) {
    console.error('toggleFollow error:', e)
    throw e
  }
}

export async function checkFollowStatus(followerId, followingId) {
  try {
    if (!followerId || !followingId) return false
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle()
    if (error) throw error
    return !!data
  } catch (e) {
    console.error('checkFollowStatus error:', e)
    return false
  }
}

export async function fetchFollowCounts(userId) {
  try {
    if (!userId) return { followers: 0, following: 0 }

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId)
    ])

    return {
      followers: followersRes.count || 0,
      following: followingRes.count || 0
    }
  } catch (e) {
    console.error('fetchFollowCounts error:', e)
    return { followers: 0, following: 0 }
  }
}

// =============================================
// Wave 2: Feed (Лента подписок)
// =============================================

export async function fetchFeedPaintings(userId) {
  try {
    if (!userId) return []

    // 1. Находим ID авторов, на которых подписан пользователь
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)

    if (followsError) throw followsError

    const followingIds = follows?.map(f => f.following_id) || []

    if (followingIds.length > 0) {
      // 2. Загружаем свежие работы этих авторов (только финишированные)
      const { data: paintings, error: pError } = await supabase
        .from('paintings')
        .select('*')
        .in('user_id', followingIds)
        .eq('is_finished', true)
        .order('created_at', { ascending: false })

      if (pError) throw pError

      if (paintings && paintings.length > 0) {
        // Загружаем профили авторов
        const authorIds = [...new Set(paintings.map(p => p.user_id))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', authorIds)

        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, cleanProfile(p)]))
        return paintings.map(p => ({
          ...p,
          profiles: profileMap[p.user_id] || null
        }))
      }
    }

    // 3. ФОЛЛБЭК: Если подписок нет или у них нет постов, возвращаем популярных авторов
    console.log('Feed is empty, fetching popular creators fallback...')
    const { data: popularProfiles, error: popError } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', userId)
      .order('finished_work_count', { ascending: false })
      .limit(6)

    if (popError) throw popError

    if (!popularProfiles || popularProfiles.length === 0) return []

    const popularIds = popularProfiles.map(p => p.id)
    const { data: fallbackPaintings, error: fbError } = await supabase
      .from('paintings')
      .select('*')
      .in('user_id', popularIds)
      .eq('is_finished', true)
      .order('created_at', { ascending: false })

    if (fbError) throw fbError

    const profileMap = Object.fromEntries(popularProfiles.map(p => [p.id, cleanProfile(p)]))

    // Возвращаем как картины с профилями, так и список рекомендуемых авторов в специальном поле первого элемента
    const result = (fallbackPaintings || []).map(p => ({
      ...p,
      profiles: profileMap[p.user_id] || null
    }))

    // Прикрепляем список рекомендованных авторов для отображения во фронтенде
    if (result.length > 0) {
      result[0].recommendedCreators = popularProfiles.map(cleanProfile)
    } else {
      // Если даже картин нет, вернем пустой список с рекомендованными профилями
      return [{ id: 'empty-fallback', recommendedCreators: popularProfiles.map(cleanProfile) }]
    }

    return result
  } catch (e) {
    console.error('fetchFeedPaintings error:', e)
    return []
  }
}

// =============================================
// Wave 2: Explore (Поиск и Интересное)
// =============================================

export async function fetchExplorePaintings(filters = {}) {
  try {
    const { searchQuery, category, onlyFinished, tag, sort } = filters

    let paintingIdsFromTag = null

    // 1. Если выбран тег, сначала находим связанные картины
    if (tag) {
      const { data: tagRecord } = await supabase
        .from('tags')
        .select('id')
        .eq('name', tag.toLowerCase().trim())
        .maybeSingle()

      if (tagRecord) {
        const { data: pTags } = await supabase
          .from('painting_tags')
          .select('painting_id')
          .eq('tag_id', tagRecord.id)

        paintingIdsFromTag = pTags?.map(pt => pt.painting_id) || []
        // Если картин с таким тегом нет, сразу возвращаем пустоту
        if (paintingIdsFromTag.length === 0) return []
      } else {
        return [] // Тег не найден
      }
    }

    // 2. Строим запрос к картинам
    let query = supabase
      .from('paintings')
      .select('*, post_likes(count)')

    if (category && category !== 'All' && category !== 'Все') {
      query = query.eq('category', category)
    }

    if (onlyFinished) {
      query = query.eq('is_finished', true)
    }

    if (paintingIdsFromTag) {
      query = query.in('id', paintingIdsFromTag)
    }

    // 3. Текстовый поиск (по названию, описанию или хештегам)
    if (searchQuery && searchQuery.trim().length > 0) {
      const cleanSearch = searchQuery.trim()
      
      // Находим хештеги в поисковом запросе (любые слова, начинающиеся с #)
      const hashtags = []
      const hashtagRegex = /#([a-zA-Z0-9_\u0400-\u04FF-]+)/g
      let match
      while ((match = hashtagRegex.exec(cleanSearch)) !== null) {
        hashtags.push(match[1].toLowerCase())
      }

      // Поисковые слова для сопоставления с тегами
      let tagSearchNames = [...hashtags]
      if (tagSearchNames.length === 0) {
        // Если знаков решетки нет, используем очищенную поисковую строку целиком
        tagSearchNames.push(cleanSearch.toLowerCase())
      }

      let paintingIdsFromTags = []
      try {
        // Запрашиваем подходящие теги из таблицы tags
        const orConditions = tagSearchNames.map(name => `name.ilike.%${name}%`).join(',')
        const { data: matchedTags } = await supabase
          .from('tags')
          .select('id')
          .or(orConditions)

        if (matchedTags && matchedTags.length > 0) {
          const tagIds = matchedTags.map(t => t.id)
          // Запрашиваем ID картин, у которых есть эти теги
          const { data: pTags } = await supabase
            .from('painting_tags')
            .select('painting_id')
            .in('tag_id', tagIds)
          
          if (pTags && pTags.length > 0) {
            paintingIdsFromTags = [...new Set(pTags.map(pt => pt.painting_id))]
          }
        }
      } catch (err) {
        console.error('Error fetching paintings by tags:', err)
      }

      // Формируем OR условие
      let orClause = `title.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`
      if (paintingIdsFromTags.length > 0) {
        orClause += `,id.in.(${paintingIdsFromTags.join(',')})`
      }
      query = query.or(orClause)
    }

    const { data: paintings, error } = await query

    if (error) throw error
    if (!paintings || paintings.length === 0) return []

    // 4. Догружаем профили авторов для результатов
    const authorIds = [...new Set(paintings.map(p => p.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', authorIds)

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, cleanProfile(p)]))

    let processed = paintings.map(p => ({
      ...p,
      profiles: profileMap[p.user_id] || null,
      likesCount: p.post_likes?.[0]?.count || 0
    }))

    // 5. Сортировка на стороне клиента (быстро и надежно)
    if (sort === 'popular') {
      processed.sort((a, b) => b.likesCount - a.likesCount)
    } else {
      processed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    return processed
  } catch (e) {
    console.error('fetchExplorePaintings error:', e)
    return []
  }
}

// =============================================
// Wave 2: Collections (Коллекции / Альбомы)
// =============================================

export async function createCollection(userId, name, description = '') {
  try {
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: userId, name, description })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('createCollection error:', e)
    throw e
  }
}

export async function fetchUserCollections(userId) {
  try {
    // Получаем коллекции
    const { data: collections, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!collections || collections.length === 0) return []

    // Для каждой коллекции получаем привязанные картины
    const enriched = []
    for (const coll of collections) {
      const { data: mappings, error: mapErr } = await supabase
        .from('collection_paintings')
        .select('painting:paintings(*)')
        .eq('collection_id', coll.id)

      if (mapErr) throw mapErr

      const items = mappings?.map(m => m.painting).filter(Boolean) || []
      enriched.push({
        ...coll,
        paintings: items
      })
    }

    return enriched
  } catch (e) {
    console.error('fetchUserCollections error:', e)
    return []
  }
}

export async function addPaintingToCollection(collectionId, paintingId) {
  try {
    const { data, error } = await supabase
      .from('collection_paintings')
      .insert({ collection_id: collectionId, painting_id: paintingId })
      .select()
      .single()

    if (error && error.code !== '23505') throw error // Игнорируем ошибку уникальности
    return data
  } catch (e) {
    console.error('addPaintingToCollection error:', e)
    throw e
  }
}

export async function removePaintingFromCollection(collectionId, paintingId) {
  try {
    const { error } = await supabase
      .from('collection_paintings')
      .delete()
      .eq('collection_id', collectionId)
      .eq('painting_id', paintingId)

    if (error) throw error
  } catch (e) {
    console.error('removePaintingFromCollection error:', e)
    throw e
  }
}

export async function fetchPaintingCollectionStatus(paintingId, userId) {
  try {
    if (!userId || !paintingId) return []
    // Возвращает массив ID коллекций пользователя, в которые уже добавлена эта картина
    const { data: colls } = await supabase
      .from('collections')
      .select('id')
      .eq('user_id', userId)

    if (!colls || colls.length === 0) return []
    const collIds = colls.map(c => c.id)

    const { data: mappings } = await supabase
      .from('collection_paintings')
      .select('collection_id')
      .in('collection_id', collIds)
      .eq('painting_id', paintingId)

    return mappings?.map(m => m.collection_id) || []
  } catch (e) {
    console.error('fetchPaintingCollectionStatus error:', e)
    return []
  }
}

// =============================================
// Wave 2: Stories (Истории / WIP)
// =============================================

export async function fetchActiveStories() {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!stories || stories.length === 0) return []

    // Подгружаем профили создателей
    const userIds = [...new Set(stories.map(s => s.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds)

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, cleanProfile(p)]))

    // Группируем истории по пользователям
    const userStoriesMap = new Map()
    stories.forEach(s => {
      const user = profileMap[s.user_id]
      if (!user) return

      if (!userStoriesMap.has(s.user_id)) {
        userStoriesMap.set(s.user_id, {
          user,
          stories: []
        })
      }
      userStoriesMap.get(s.user_id).stories.push(s)
    })

    return Array.from(userStoriesMap.values())
  } catch (e) {
    console.error('fetchActiveStories error:', e)
    return []
  }
}

export async function uploadStory(userId, file, caption = '') {
  try {
    // Загружаем картинку/видео в бакет paintings (переиспользуем бакет для удобства)
    let processedFile = file
    if (file.type && file.type.startsWith('image/')) {
      processedFile = await convertHeicToJpeg(file)
    }
    const fileExt = processedFile.name.split('.').pop()
    const fileName = `${userId}/stories/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('paintings')
      .upload(fileName, processedFile)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('paintings')
      .getPublicUrl(fileName)

    // Создаем запись в таблице stories
    const { data, error } = await supabase
      .from('stories')
      .insert({
        user_id: userId,
        image_url: publicUrl,
        caption,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // ровно 24 часа
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('uploadStory error:', e)
    throw e
  }
}


