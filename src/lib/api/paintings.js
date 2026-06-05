import { attachAuthors, supabase } from './core'
import { fetchBlockedIds } from './moderation'

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
  const payload = {
    ...painting,
    is_finished: painting.is_finished || false,
    is_ai_generated: painting.is_ai_generated || false
  }
  const { data, error } = await supabase
    .from('paintings')
    .insert(payload)
    .select()
    .single()

  // Degrade gracefully if the moderation migration hasn't been applied yet.
  if (error && error.message?.includes('is_nsfw')) {
    const { is_nsfw, ...rest } = payload
    const retry = await supabase.from('paintings').insert(rest).select().single()
    if (retry.error) throw retry.error
    return retry.data
  }
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


export async function fetchPaintingsByTag(tagName, currentUserId) {
  try {
    // painting_tags is a join table (painting_id, tag_id) — the tag name lives in
    // the `tags` table, so resolve the tag id first, then its paintings.
    const { data: tagRecord } = await supabase
      .from('tags')
      .select('id')
      .eq('name', tagName)
      .maybeSingle()

    if (!tagRecord) return []

    const { data: pTags, error: ptError } = await supabase
      .from('painting_tags')
      .select('painting_id')
      .eq('tag_id', tagRecord.id)

    if (ptError) throw ptError
    const paintingIds = [...new Set((pTags || []).map(pt => pt.painting_id))]
    if (paintingIds.length === 0) return []

    // Load the paintings, then attach author profiles separately — PostgREST has no
    // direct paintings→profiles FK to embed, so we use the shared attachAuthors path.
    let query = supabase
      .from('paintings')
      .select('*')
      .in('id', paintingIds)
      .eq('is_finished', true)
      .order('created_at', { ascending: false })

    if (currentUserId) {
      const blockedIds = await fetchBlockedIds(currentUserId)
      if (blockedIds.length > 0) {
        query = query.not('user_id', 'in', `(${blockedIds.join(',')})`)
      }
    }

    const { data, error } = await query
    if (error) throw error

    return await attachAuthors(data || [])
  } catch (err) {
    console.error('fetchPaintingsByTag error:', err)
    return []
  }
}

// Loads a single painting (with its author attached) by id. Used for deep links
// like /post/:id when someone opens a shared post URL.

export async function fetchPaintingById(paintingId) {
  try {
    if (!paintingId) return null
    const { data, error } = await supabase
      .from('paintings')
      .select('*')
      .eq('id', paintingId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const [enriched] = await attachAuthors([data])
    return enriched || null
  } catch (err) {
    console.error('fetchPaintingById error:', err)
    return null
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


export async function incrementPaintingViews(paintingId) {
  try {
    if (!paintingId) return
    const { error } = await supabase.rpc('increment_painting_views', { target_painting_id: paintingId })
    if (error) throw error
  } catch (e) {
    console.error('incrementPaintingViews error:', e)
  }
}

// =============================================
// Online Status
// =============================================

