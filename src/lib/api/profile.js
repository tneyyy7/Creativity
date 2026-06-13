import { cleanProfile, enrichProfilesWithProData, supabase } from './core'
import { convertHeicToJpeg } from './paintings'
import { compressImage } from '../../utils/compressImage'

export async function fetchProfile(userId) {
  try {
    // Stage 1: Try full fetch
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count, specialization, last_seen, theme, is_onboarding_completed, interests')
      .eq('id', userId)
      .single()

    if (!error) {
      const cleaned = cleanProfile(data)
      return await enrichProfilesWithProData(cleaned)
    }

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
    const cleaned = cleanProfile(retry)
    return await enrichProfilesWithProData(cleaned)
  } catch (e) {
    console.error("fetchProfile error:", e)
    return null
  }
}


// Дозаписывает реферальную атрибуцию текущему юзеру, только если поля ещё
// пустые (first-touch). Надёжно работает даже если профиль создан триггером.
export const attachReferral = async ({ code, host, ts }) => {
  if (!code && !host) return false
  try {
    const { error } = await supabase.rpc('set_my_referral', {
      p_code: code || null,
      p_host: host || null,
      p_captured_at: ts || null,
    })
    if (error) throw error
    return true
  } catch (e) {
    console.error('attachReferral error:', e)
    return false
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
  if (profile.theme !== undefined) profileData.theme = profile.theme
  if (profile.referral_code !== undefined) profileData.referral_code = profile.referral_code
  if (profile.referrer_host !== undefined) profileData.referrer_host = profile.referrer_host
  if (profile.social_links !== undefined) profileData.social_links = profile.social_links

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profileData)
    .select()
    .single()

  if (error) {
    // social_links column may not be migrated yet — retry without it so the
    // rest of the profile still saves (the links just won't persist).
    if (/social_links/.test(error.message || '') && profileData.social_links !== undefined) {
      const { social_links: _omit, ...rest } = profileData
      const retry = await supabase.from('profiles').upsert(rest).select().single()
      if (retry.error) throw retry.error
      return retry.data
    }
    throw error
  }
  return data
}


// Persist the free banner gradient preset id on the user's own profile row.
// Kept separate from upsertProfile so a not-yet-migrated banner_gradient column
// (returns "column does not exist") fails softly without blocking other saves.
// Returns true on success, false if the column is missing or the update failed.
export const updateBannerGradient = async (userId, gradientId) => {
  if (!userId) return false
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ banner_gradient: gradientId || null, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      if (/banner_gradient/.test(error.message || '')) {
        console.warn('banner_gradient column not migrated yet — skipping persist')
        return false
      }
      throw error
    }
    return true
  } catch (e) {
    console.error('updateBannerGradient error:', e)
    return false
  }
}


export const uploadAvatar = async (file, userId) => {
  const heicFile = await convertHeicToJpeg(file)
  const processedFile = await compressImage(heicFile, { maxPx: 400, quality: 0.85 })
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


export const fetchPublicProfile = async (userId) => {
  try {
    const baseCols = 'id, nickname, avatar_url, bio, is_private, is_verified, finished_work_count, specialization'
    let { data, error } = await supabase
      .from('profiles')
      .select(`${baseCols}, banner_gradient, social_links`)
      .eq('id', userId)
      .single()
    // banner_gradient/social_links columns may not be migrated yet — retry
    // without the optional columns so the profile still loads (the gradient
    // falls back to default and the link row simply hides).
    if (error && /banner_gradient|social_links/.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('profiles')
        .select(baseCols)
        .eq('id', userId)
        .single())
    }
    if (error && error.message?.includes('finished_work_count')) {
      const { data: retry } = await supabase
        .from('profiles')
        .select('nickname, avatar_url, bio, is_private, is_verified, specialization')
        .eq('id', userId)
        .single()
      const cleaned = cleanProfile(retry)
      return await enrichProfilesWithProData(cleaned)
    }
    if (error) throw error
    const cleaned = cleanProfile(data)
    return await enrichProfilesWithProData(cleaned)
  } catch (e) {
    console.error("fetchPublicProfile error:", e)
    return null
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
      const cleaned = cleanProfile(retryData)
      return await enrichProfilesWithProData(cleaned)
    }
    if (error) throw error
    const cleaned = cleanProfile(data)
    return await enrichProfilesWithProData(cleaned)
  } catch (e) {
    console.error("fetchProfileMinimal error:", e)
    return null
  }
}

// --- MESSAGING LOGIC ---


export async function fetchProProfileSettings(userId) {
  try {
    if (!userId) return null
    const { data, error } = await supabase
      .from('pro_profile_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (e) {
    console.error('fetchProProfileSettings error:', e)
    return null
  }
}


export async function updateProProfileSettings(userId, settings) {
  try {
    if (!userId) return null
    const { data, error } = await supabase
      .from('pro_profile_settings')
      .upsert({
        user_id: userId,
        avatar_frame: settings.avatar_frame || 'default',
        nickname_color: settings.nickname_color || '',
        chat_theme: settings.chat_theme || 'default',
        cover_url: settings.cover_url || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('updateProProfileSettings error:', e)
    throw e
  }
}


// Upload a profile cover (header background) image to the `paintings` bucket.
// Returns the public URL. The caller persists it via updateProProfileSettings.
export async function uploadProfileCover(userId, file) {
  try {
    if (!userId || !file) throw new Error('Missing user ID or file')

    const compressed = await compressImage(file, { maxPx: 1920, quality: 0.80 })
    const fileExt = compressed.name ? compressed.name.split('.').pop() : 'jpg'
    const fileName = `${userId}/cover/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('paintings')
      .upload(fileName, compressed, { upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('paintings')
      .getPublicUrl(fileName)

    return publicUrl
  } catch (e) {
    console.error('uploadProfileCover error:', e)
    throw e
  }
}

