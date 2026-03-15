import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing')
console.log('Supabase Key:', supabaseAnonKey ? 'Found' : 'Missing')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('Supabase client initialized')

export const uploadPainting = async (file, userId) => {
  const fileName = `${userId}/${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from('paintings')
    .upload(fileName, file)

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
    finished_work_count: data.finished_work_count || 0
  }
}

export async function fetchProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
      .eq('id', userId)
      .single()
    if (error) {
      if (error.message?.includes('finished_work_count')) {
        const { data: retry } = await supabase
          .from('profiles')
          .select('nickname, avatar_url, bio, is_private, is_verified')
          .eq('id', userId)
          .single()
        return cleanProfile(retry)
      }
      if (error.code !== 'PGRST116') throw error
    }
    return cleanProfile(data)
  } catch (e) {
    console.error("fetchProfile error:", e)
    return null
  }
}

export const upsertProfile = async (profile) => {
  const profileData = {
    id: profile.id,
    nickname: profile.nickname,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    is_private: profile.is_private,
    is_verified: profile.is_verified,
    updated_at: new Date().toISOString()
  }
  
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
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Math.random()}.${fileExt}`
  const filePath = `${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file)

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
      .select('id, nickname, avatar_url, is_verified, finished_work_count')
      .ilike('nickname', `%${query}%`)
      .neq('id', currentUserId)
      .limit(10)
    
    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, is_verified')
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
      .select('id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
      .eq('id', userId)
      .single()
    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('nickname, avatar_url, bio, is_private, is_verified')
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
        sender:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count),
        receiver:profiles!friendships_receiver_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count)
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
          .select('id, nickname, avatar_url, is_verified, finished_work_count')
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
        profile:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count)
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
      .select('id, nickname, avatar_url, is_verified, finished_work_count')
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
      .select('id, nickname, avatar_url, is_verified, finished_work_count')
      .ilike('nickname', `%${query}%`)
      .in('id', friendIds)
      .limit(10)
    
    if (pError && pError.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, is_verified')
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
      .select('id, nickname, avatar_url, finished_work_count')
      .in('id', userIds)
    const profileMap = {}
    ;(profiles || []).forEach(p => { profileMap[p.id] = p })

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
      .select('id, nickname, avatar_url, finished_work_count')
      .in('id', userIds)
    const profileMap = {}
    ;(profiles || []).forEach(p => { profileMap[p.id] = p })

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
      .select('*, actor:profiles!notifications_actor_id_fkey(id, nickname, avatar_url, finished_work_count), painting:paintings!notifications_painting_id_fkey(id, title, image_url)')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(30)
    
    if (error) throw error
    return notifications || []
  } catch (e) {
    console.error('fetchPostNotifications error:', e)
    return []
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
