import { supabase } from './core'

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

