import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env vars missing: check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


export function cleanProfile(data) {
  if (!data) return null
  if (Array.isArray(data)) return data.map(cleanProfile)
  return {
    ...data,
    finished_work_count: data.finished_work_count || 0,
    specialization: data.specialization || null,
    last_seen: data.last_seen || null
  }
}


export async function enrichProfilesWithProData(profiles) {
  if (!profiles) return []
  const isArray = Array.isArray(profiles)
  const profileList = isArray ? profiles : [profiles]
  if (profileList.length === 0) return profiles

  try {
    const profileIds = profileList.map(p => p?.id).filter(Boolean)
    if (profileIds.length === 0) return profiles

    // Fetch both in parallel.
    // NOTE: subscriptions has RLS "own row only" — for other users this may return [].
    // pro_profile_settings has RLS USING(true) — always readable.
    const [subResult, settingsResult] = await Promise.all([
      supabase.from('subscriptions').select('user_id, status, current_period_end').in('user_id', profileIds),
      supabase.from('pro_profile_settings').select('user_id, avatar_frame, nickname_color, chat_theme, cover_url').in('user_id', profileIds)
    ])

    const now = new Date()
    const subMap = {}
    if (subResult.data) {
      subResult.data.forEach(s => {
        const isPro = s.status === 'active' || (s.status === 'cancelled' && s.current_period_end && new Date(s.current_period_end) > now)
        subMap[s.user_id] = isPro
      })
    }

    const settingsMap = {}
    if (settingsResult.data) {
      settingsResult.data.forEach(s => {
        settingsMap[s.user_id] = s
      })
    }

    const enrichedList = profileList.map(p => {
      if (!p) return p
      const settings = settingsMap[p.id] || {}
      // Primary: use subscription status if available (own profile / public RLS)
      // Fallback: if a pro_profile_settings row exists → user is/was Pro
      let isPro = false
      if (p.id in subMap) {
        isPro = !!subMap[p.id]
      } else if (settings.user_id) {
        // settings exist → user has (or had) Pro; treat as Pro to show their customizations
        isPro = true
      }
      return {
        ...p,
        isPro,
        avatar_frame: settings.avatar_frame || 'default',
        nickname_color: settings.nickname_color || '',
        chat_theme: settings.chat_theme || 'default',
        cover_url: settings.cover_url || ''
      }
    })

    return isArray ? enrichedList : enrichedList[0]
  } catch (err) {
    console.error('Error enriching profiles with Pro data:', err)
    return profiles
  }
}


export async function fetchProfilesByIds(ids) {
  if (!ids || ids.length === 0) return []
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', ids)
  if (error) throw error
  const cleaned = (profiles || []).map(p => cleanProfile(p))
  return await enrichProfilesWithProData(cleaned)
}

// =============================================
// Wave 2: Feed (Лента подписок)
// =============================================

// Server-side paginated subscription feed.
// Returns { items, hasMore, recommendedCreators } so the UI can append pages
// via infinite scroll instead of slicing a fully-loaded array.
//   page      — zero-based page index
//   pageSize  — rows per page
//   blockedIds — author ids to exclude (caller resolves once, see fetchBlockedIds)

export async function attachAuthors(paintings) {
  if (!paintings || paintings.length === 0) return []
  const authorIds = [...new Set(paintings.map(p => p.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', authorIds)

  const cleanedProfiles = (profiles || []).map(p => cleanProfile(p))
  const enrichedProfiles = await enrichProfilesWithProData(cleanedProfiles)
  const profileMap = Object.fromEntries(enrichedProfiles.map(p => [p.id, p]))

  return paintings.map(p => ({
    ...p,
    profiles: profileMap[p.user_id] || null,
    likes_count: p.likes_count ?? 0,
    comments_count: p.comments_count ?? 0
  }))
}

// =============================================
// Wave 2: Explore (Поиск и Интересное)
// =============================================

