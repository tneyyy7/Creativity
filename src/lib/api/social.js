import { cleanProfile, enrichProfilesWithProData, fetchProfilesByIds, supabase } from './core'

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
      const cleaned = (retry || []).map(p => cleanProfile(p))
      return await enrichProfilesWithProData(cleaned)
    }
    if (error) throw error
    const cleaned = (data || []).map(p => cleanProfile(p))
    return await enrichProfilesWithProData(cleaned)
  } catch (e) {
    console.error("searchUsers error:", e)
    return []
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

        const cleanedProfiles = (profiles || []).map(p => cleanProfile(p))
        const enrichedProfiles = await enrichProfilesWithProData(cleanedProfiles)
        const profileMap = Object.fromEntries(enrichedProfiles.map(p => [p.id, p]))

        return relations.map(r => {
          const friendId = r.sender_id === userId ? r.receiver_id : r.sender_id
          const profile = profileMap[friendId]
          return { ...r, profile: profile || null }
        })
      }
      throw error
    }

    const friends = data?.map(f => {
      const friendProfile = f.sender_id === userId ? f.receiver : f.sender
      const friendProfileParsed = friendProfile && Array.isArray(friendProfile) ? friendProfile[0] : friendProfile
      return { ...f, profile: cleanProfile(friendProfileParsed) }
    }) || []

    const profilesOnly = friends.map(f => f.profile).filter(Boolean)
    const enrichedProfiles = await enrichProfilesWithProData(profilesOnly)
    const profileMap = Object.fromEntries(enrichedProfiles.map(p => [p.id, p]))

    return friends.map(f => ({
      ...f,
      profile: f.profile ? profileMap[f.profile.id] : null
    }))
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
        const { data: rawProfiles } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url, is_verified, finished_work_count')
          .in('id', senderIds)

        const enriched = await enrichProfilesWithProData((rawProfiles || []).map(p => cleanProfile(p)))
        const profileMap = Object.fromEntries(enriched.map(p => [p.id, p]))

        return requests.map(r => ({
          ...r,
          profile: profileMap[r.sender_id] || null
        }))
      }
      throw error
    }

    const rawRequests = data?.map(r => ({ ...r, profile: cleanProfile(r.profile) })) || []
    const profiles = rawRequests.map(r => r.profile).filter(Boolean)
    const enriched = await enrichProfilesWithProData(profiles)
    const profileMap = Object.fromEntries(enriched.map(p => [p.id, p]))
    return rawRequests.map(r => ({ ...r, profile: r.profile ? profileMap[r.profile.id] || r.profile : null }))
  } catch (e) {
    console.error("fetchPendingRequests error:", e)
    return []
  }
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
      const cleaned = (retry || []).map(p => ({
        ...p,
        nickname: p.nickname || 'Unknown Artist',
        avatar_url: p.avatar_url || null,
        is_verified: p.is_verified || false
      }))
      return await enrichProfilesWithProData(cleaned)
    }
    if (pError) throw pError
    const cleaned = (profiles || []).map(p => ({
      ...p,
      nickname: p.nickname || 'Unknown Artist',
      avatar_url: p.avatar_url || null,
      is_verified: p.is_verified || false
    }))
    return await enrichProfilesWithProData(cleaned)
  } catch (e) {
    console.error("searchFriends error:", e)
    return []
  }
}

// =============================================
// Post Likes
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
      .select('follower_id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle()
    if (error) throw error
    return !!data
  } catch (err) {
    console.error("Check follow error:", err)
    return false
  }
}


export async function toggleTagFollow(userId, tagName) {
  try {
    const { data, error: checkError } = await supabase
      .from('tag_follows')
      .select('user_id')
      .eq('user_id', userId)
      .eq('tag_name', tagName)
      .maybeSingle()
      
    if (checkError) throw checkError
    
    if (data) {
      const { error } = await supabase
        .from('tag_follows')
        .delete()
        .eq('user_id', userId)
        .eq('tag_name', tagName)
      if (error) throw error
      return false
    } else {
      const { error } = await supabase
        .from('tag_follows')
        .insert({ user_id: userId, tag_name: tagName })
      if (error) throw error
      return true
    }
  } catch (err) {
    console.error("Toggle tag follow error:", err)
    throw err
  }
}


export async function checkTagFollowStatus(userId, tagName) {
  try {
    if (!userId || !tagName) return false
    const { data, error } = await supabase
      .from('tag_follows')
      .select('user_id')
      .eq('user_id', userId)
      .eq('tag_name', tagName)
      .maybeSingle()
    if (error) throw error
    return !!data
  } catch (err) {
    console.error("Check tag follow error:", err)
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

// Fetch the list of users who follow `userId` (their followers)

export async function fetchFollowers(userId) {
  try {
    if (!userId) return []
    const { data: rows, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
    if (error) throw error

    const ids = [...new Set((rows || []).map(r => r.follower_id))]
    return await fetchProfilesByIds(ids)
  } catch (e) {
    console.error('fetchFollowers error:', e)
    return []
  }
}

// Fetch the list of users that `userId` is following

export async function fetchFollowing(userId) {
  try {
    if (!userId) return []
    const { data: rows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    if (error) throw error

    const ids = [...new Set((rows || []).map(r => r.following_id))]
    return await fetchProfilesByIds(ids)
  } catch (e) {
    console.error('fetchFollowing error:', e)
    return []
  }
}

// Helper: load cleaned + Pro-enriched profiles for a list of user ids
