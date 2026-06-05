import { supabase } from './core'

export async function fetchSubscriptionStatus(userId) {
  try {
    if (!userId) return { plan: 'free', status: 'inactive', isPro: false }
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!data) return { plan: 'free', status: 'inactive', isPro: false }

    const now = new Date()
    const isPro = data.status === 'active' || (data.status === 'cancelled' && data.current_period_end && new Date(data.current_period_end) > now)

    return {
      ...data,
      isPro
    }
  } catch (e) {
    console.error('fetchSubscriptionStatus error:', e)
    return { plan: 'free', status: 'inactive', isPro: false }
  }
}


export async function fetchCustomEmojis(userId) {
  try {
    if (!userId) return []
    const { data, error } = await supabase
      .from('custom_emojis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (e) {
    console.error('fetchCustomEmojis error:', e)
    return []
  }
}


export async function uploadCustomEmoji(userId, name, croppedFile) {
  try {
    if (!userId || !croppedFile) throw new Error('Missing user ID or file')

    const fileExt = croppedFile.name ? croppedFile.name.split('.').pop() : 'png'
    const fileName = `${userId}/emojis/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('paintings')
      .upload(fileName, croppedFile)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('paintings')
      .getPublicUrl(fileName)

    const { data, error } = await supabase
      .from('custom_emojis')
      .insert({
        user_id: userId,
        name: name.replace(/:/g, ''),
        image_url: publicUrl
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('uploadCustomEmoji error:', e)
    throw e
  }
}


export async function deleteCustomEmoji(emojiId) {
  try {
    if (!emojiId) return false
    
    const { error } = await supabase
      .from('custom_emojis')
      .delete()
      .eq('id', emojiId)

    if (error) throw error
    return true
  } catch (e) {
    console.error('deleteCustomEmoji error:', e)
    throw e
  }
}

