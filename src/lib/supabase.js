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

export const fetchProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
    .eq('id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, is_verified, finished_work_count')
    .ilike('nickname', `%${query}%`)
    .neq('id', currentUserId)
    .limit(10)
  
  if (error) throw error
  return data
}

export const fetchPublicProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, avatar_url, bio, is_private, is_verified, finished_work_count')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      status,
      sender_id,
      receiver_id,
      profile:profiles!friendships_receiver_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count)
    `)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted')
  
  if (error) throw error
  return data
}

export const fetchPendingRequests = async (userId) => {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      sender_id,
      profile:profiles!friendships_sender_id_fkey(id, nickname, avatar_url, is_verified, finished_work_count)
    `)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
  
  if (error) throw error
  return data
}

// Fetch a specific profile by ID (minimal fields for loops)
export const fetchProfileMinimal = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, is_verified, finished_work_count')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
}
