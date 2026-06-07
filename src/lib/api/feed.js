import { attachAuthors, cleanProfile, enrichProfilesWithProData, supabase } from './core'

export async function fetchFeedPaintings(userId, { page = 0, pageSize = 10, blockedIds = [] } = {}) {
  const empty = { items: [], hasMore: false, recommendedCreators: [] }
  try {
    if (!userId) return empty

    // 1. Authors the user follows
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)

    if (followsError) throw followsError

    const followingIds = (follows?.map(f => f.following_id) || [])
      .filter(id => !blockedIds.includes(id))

    const from = page * pageSize
    const to = from + pageSize // request one extra row to detect hasMore

    if (followingIds.length > 0) {
      // 2. Fresh finished works from followed authors — paginated & ordered on the server
      const { data: paintings, error: pError } = await supabase
        .from('paintings')
        .select('*')
        .in('user_id', followingIds)
        .eq('is_finished', true)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (pError) throw pError

      if (paintings && paintings.length > 0) {
        const hasMore = paintings.length > pageSize
        const pageItems = hasMore ? paintings.slice(0, pageSize) : paintings
        const items = await attachAuthors(pageItems)
        return { items, hasMore, recommendedCreators: [] }
      }
      // Followed authors exist but have no posts on this page — if it's the very
      // first page, drop through to the popular-creators fallback below.
      if (page > 0) return empty
    }

    // 3. FALLBACK (first page only): recommend popular creators + their works
    if (page > 0) return empty

    const { data: popularProfiles, error: popError } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', userId)
      .order('finished_work_count', { ascending: false })
      .limit(6)

    if (popError) throw popError
    if (!popularProfiles || popularProfiles.length === 0) return empty

    const popularIds = popularProfiles
      .map(p => p.id)
      .filter(id => !blockedIds.includes(id))

    const cleanedPopular = popularProfiles
      .filter(p => !blockedIds.includes(p.id))
      .map(p => cleanProfile(p))
    const enrichedPopular = await enrichProfilesWithProData(cleanedPopular)

    let fallbackItems = []
    if (popularIds.length > 0) {
      const { data: fallbackPaintings } = await supabase
        .from('paintings')
        .select('*')
        .in('user_id', popularIds)
        .eq('is_finished', true)
        .order('created_at', { ascending: false })
        .limit(pageSize)
      fallbackItems = await attachAuthors(fallbackPaintings || [])
    }

    return { items: fallbackItems, hasMore: false, recommendedCreators: enrichedPopular }
  } catch (e) {
    console.error('fetchFeedPaintings error:', e)
    return empty
  }
}


export async function fetchForYouPaintings(userId, { page = 0, pageSize = 10, blockedIds = [] } = {}) {
  const empty = { items: [], hasMore: false }
  try {
    if (!userId) return empty

    // 1. Fetch user's interests from profile
    let interests = []
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', userId)
      .maybeSingle()
    if (profile && profile.interests) {
      interests = profile.interests
    }

    const from = page * pageSize
    
    // Try calling personalized RPC first
    let { data: paintings, error } = await supabase
      .rpc('get_for_you_feed_personalized', {
        p_user_id: userId,
        p_interests: interests,
        p_limit: pageSize + 1,
        p_offset: from,
        p_blocked_ids: blockedIds
      })

    // Fallback if personalized RPC doesn't exist
    if (error && (error.message?.includes('get_for_you_feed_personalized') || error.message?.includes('Could not find the function'))) {
      console.warn('RPC get_for_you_feed_personalized not found, trying get_for_you_feed')
      const fallbackRpc = await supabase
        .rpc('get_for_you_feed', {
          p_user_id: userId,
          p_limit: pageSize + 1,
          p_offset: from,
          p_blocked_ids: blockedIds
        })
      paintings = fallbackRpc.data
      error = fallbackRpc.error
    }

    // Fallback to explore API if both RPCs fail
    if (error && (error.message?.includes('Could not find the function') || error.message?.includes('get_for_you_feed'))) {
      console.warn('No RPC feeds found, falling back to explore API')
      return await fetchExplorePaintings({ sort: 'popular' }, { page, pageSize, blockedIds })
    }
    if (error) throw error
    if (!paintings || paintings.length === 0) return empty

    const hasMore = paintings.length > pageSize
    const pageRows = hasMore ? paintings.slice(0, pageSize) : paintings

    const enriched = await attachAuthors(pageRows)
    const items = enriched.map(p => ({
      ...p,
      likesCount: p.likes_count ?? 0
    }))

    return { items, hasMore }
  } catch (e) {
    console.error('fetchForYouPaintings error:', e)
    return empty
  }
}


export async function fetchRecommendedCreators(userId, blockedIds = []) {
  try {
    let followingIds = []
    if (userId) {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
      if (followsData) {
        followingIds = followsData.map(f => f.following_id)
      }
    }

    const excludeIds = new Set([userId, ...blockedIds, ...followingIds])

    const { data: popularProfiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('finished_work_count', { ascending: false })
      .limit(50)

    if (error) throw error
    if (!popularProfiles) return []

    const cleaned = popularProfiles
      .filter(p => !excludeIds.has(p.id))
      .map(p => cleanProfile(p))
      .slice(0, 10)

    return await enrichProfilesWithProData(cleaned)
  } catch (err) {
    console.error('Error fetching recommended creators:', err)
    return []
  }
}

// Attaches enriched author profiles to a list of paintings and normalizes the
// denormalized like/comment counters. Shared by feed + explore.

export async function fetchExplorePaintings(filters = {}, { page = 0, pageSize = 12, blockedIds = [] } = {}) {
  const empty = { items: [], hasMore: false }
  try {
    const { searchQuery, category, onlyFinished, tag, sort } = filters

    // Boost surfacing: on the default Popular browse (no search/tag), boosted posts
    // are pulled to the top of page 0 and removed from the normal stream so they
    // appear exactly once. Filtered/searched views are left untouched.
    const boostMode = sort === 'popular' && !(searchQuery && searchQuery.trim()) && !tag
    let boostedIds = []
    if (boostMode) {
      try {
        const { data: bIds } = await supabase.rpc('get_active_boosted_ids')
        boostedIds = (bIds || []).map(r => r.painting_id)
      } catch (e) { console.error('get_active_boosted_ids error:', e) }
    }

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
        if (paintingIdsFromTag.length === 0) return empty
      } else {
        return empty // Тег не найден
      }
    }

    // 2. Строим запрос к картинам
    let query = supabase
      .from('paintings')
      .select('*')

    if (category && category !== 'All' && category !== 'Все') {
      query = query.eq('category', category)
    }

    if (onlyFinished) {
      query = query.eq('is_finished', true)
    }

    if (paintingIdsFromTag) {
      query = query.in('id', paintingIdsFromTag)
    }

    // Hide works from blocked authors
    if (blockedIds.length > 0) {
      query = query.not('user_id', 'in', `(${blockedIds.join(',')})`)
    }

    // Pull boosted posts out of the normal stream (they're prepended on page 0).
    if (boostMode && boostedIds.length > 0) {
      query = query.not('id', 'in', `(${boostedIds.join(',')})`)
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

    // 4. Server-side ordering + pagination (replaces the old fetch-all + JS sort)
    if (sort === 'popular') {
      query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const from = page * pageSize
    const to = from + pageSize // request one extra row to detect hasMore
    query = query.range(from, to)

    const { data: paintings, error } = await query

    if (error) throw error

    const rows = paintings || []
    const hasMore = rows.length > pageSize
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows

    // 5. Догружаем профили авторов для результатов
    const enriched = await attachAuthors(pageRows)
    const items = enriched.map(p => ({
      ...p,
      // Explore cards read `likesCount` (camelCase); keep that alias.
      likesCount: p.likes_count ?? 0
    }))

    // Prepend boosted posts at the top of the default Popular browse (page 0 only).
    if (boostMode && page === 0 && boostedIds.length > 0) {
      let bQuery = supabase.from('paintings').select('*').in('id', boostedIds)
      if (onlyFinished) bQuery = bQuery.eq('is_finished', true)
      if (category && category !== 'All' && category !== 'Все') bQuery = bQuery.eq('category', category)
      if (blockedIds.length > 0) bQuery = bQuery.not('user_id', 'in', `(${blockedIds.join(',')})`)
      const { data: boostedRows } = await bQuery.order('created_at', { ascending: false })
      if (boostedRows && boostedRows.length > 0) {
        const boostedEnriched = await attachAuthors(boostedRows)
        const boostedItems = boostedEnriched.map(p => ({ ...p, likesCount: p.likes_count ?? 0, boosted: true }))
        return { items: [...boostedItems, ...items], hasMore }
      }
    }

    if (items.length === 0) return empty
    return { items, hasMore }
  } catch (e) {
    console.error('fetchExplorePaintings error:', e)
    return empty
  }
}

// =============================================
// Phase 1.2: Moderation (reports & blocking)
// =============================================

// Returns the set of user ids the given user has blocked. Callers pass this to
// the feed/explore fetchers so blocked authors' content is filtered server-side.
