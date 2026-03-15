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
      .select('nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
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
      .select('nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
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
    
    if (error && error.message?.includes('finished_work_count')) {
       // Fallback for missing column
       const { data: retry } = await supabase
        .from('friendships')
        .select(`
          id,
          status,
          sender_id,
          receiver_id,
          sender:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified),
          receiver:profiles!friendships_receiver_id_fkey(id, nickname, avatar_url, is_verified)
        `)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'accepted')
       
       return retry?.map(f => {
         const friendProfile = f.sender_id === userId ? f.receiver : f.sender
         return { ...f, profile: cleanProfile(friendProfile) }
       }) || []
    }
    
    if (error) throw error
    
    return data?.map(f => {
      // Determine which profile belongs to the friend
      const friendProfile = f.sender_id === userId ? f.receiver : f.sender
      return { ...f, profile: cleanProfile(friendProfile) }
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
    
    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('friendships')
        .select(`
          id,
          sender_id,
          profile:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified)
        `)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
      return retry?.map(r => ({ ...r, profile: cleanProfile(r.profile) })) || []
    }
    if (error) throw error
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

