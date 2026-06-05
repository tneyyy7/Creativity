import { cleanProfile, enrichProfilesWithProData, supabase } from './core'
import { convertHeicToJpeg } from './paintings'

export async function fetchActiveStories(currentUserId = null) {
  try {
    let query = supabase
      .from('stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    if (currentUserId) {
      // Получаем список тех, на кого подписан пользователь
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUserId)
      
      if (followsError) throw followsError
      
      const allowedUserIds = (follows || []).map(f => f.following_id)
      allowedUserIds.push(currentUserId)
      
      query = query.in('user_id', allowedUserIds)
    }

    const { data: stories, error } = await query

    if (error) throw error
    if (!stories || stories.length === 0) return []

    // Подгружаем профили создателей с Pro-данными
    const userIds = [...new Set(stories.map(s => s.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds)

    const cleanedProfiles = (profiles || []).map(p => cleanProfile(p))
    const enrichedProfiles = await enrichProfilesWithProData(cleanedProfiles)
    const profileMap = Object.fromEntries(enrichedProfiles.map(p => [p.id, p]))

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

    const result = Array.from(userStoriesMap.values())

    // Сортируем: Pro-пользователи в начало!
    result.sort((a, b) => {
      const aPro = a.user?.isPro ? 1 : 0
      const bPro = b.user?.isPro ? 1 : 0
      return bPro - aPro // 1 перед 0
    })

    return result
  } catch (e) {
    console.error('fetchActiveStories error:', e)
    return []
  }
}


export async function uploadStory(userId, file, caption = '', isPro = false) {
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
      .upload(fileName, processedFile, {
        contentType: processedFile.type || 'application/octet-stream',
        cacheControl: '3600'
      })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('paintings')
      .getPublicUrl(fileName)

    const durationHours = isPro ? 48 : 24

    // Создаем запись в таблице stories
    const { data, error } = await supabase
      .from('stories')
      .insert({
        user_id: userId,
        image_url: publicUrl,
        caption,
        expires_at: new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
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

// Check if current user liked a story

export async function checkIfStoryLiked(storyId, userId) {
  try {
    const { data, error } = await supabase
      .from('story_likes')
      .select('id')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle()
    
    if (error) throw error
    return !!data
  } catch (e) {
    console.error('checkIfStoryLiked error:', e)
    return false
  }
}

// Toggle like state on a story

export async function toggleStoryLike(storyId, userId) {
  try {
    const { data: existing, error: checkError } = await supabase
      .from('story_likes')
      .select('id')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) throw checkError

    if (existing) {
      // Unlike
      const { error: deleteError } = await supabase
        .from('story_likes')
        .delete()
        .eq('id', existing.id)
      
      if (deleteError) throw deleteError
      return false // unliked
    } else {
      // Like
      const { error: insertError } = await supabase
        .from('story_likes')
        .insert({ story_id: storyId, user_id: userId })
      
      if (insertError) throw insertError
      return true // liked
    }
  } catch (e) {
    console.error('toggleStoryLike error:', e)
    throw e
  }
}

// Fetch the set of story IDs the user has already viewed (cross-device sync via DB)

export async function fetchViewedStoryIds(userId) {
  try {
    if (!userId) return []
    const { data, error } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('user_id', userId)

    if (error) throw error
    return (data || []).map(r => r.story_id)
  } catch (e) {
    console.error('fetchViewedStoryIds error:', e)
    return []
  }
}

// Mark a story as viewed by the user (idempotent — ignores duplicates)

export async function markStoryViewed(storyId, userId) {
  try {
    if (!storyId || !userId) return false
    const { error } = await supabase
      .from('story_views')
      .upsert({ story_id: storyId, user_id: userId }, { onConflict: 'story_id,user_id', ignoreDuplicates: true })

    if (error) throw error
    return true
  } catch (e) {
    console.error('markStoryViewed error:', e)
    return false
  }
}

// Delete a story by ID

export async function deleteStory(storyId) {
  try {
    if (!storyId) return false
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)

    if (error) throw error
    return true
  } catch (e) {
    console.error('deleteStory error:', e)
    throw e
  }
}

// =============================================
// Wave 3: Subscriptions, Custom Emojis & Pro Profile Settings
// =============================================

