import { supabase } from './core'

// Pro "Boost" feature. All writes go through SECURITY DEFINER RPCs (see
// migration 20260605130000_pro_boosts.sql); these are thin wrappers.

// Caller's current boost balance: { available, monthly_quota, period_end, is_pro }.
export async function getBoostBalance() {
  try {
    const { data, error } = await supabase.rpc('get_boost_balance')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row || { available: 0, monthly_quota: 0, period_end: null, is_pro: false }
  } catch (e) {
    console.error('getBoostBalance error:', e)
    return { available: 0, monthly_quota: 0, period_end: null, is_pro: false }
  }
}

// Spend one boost on a painting. Returns the new available count.
// Throws with a coded message ('no_boosts_left', 'already_boosted', 'not_pro', ...).
export async function applyBoost(paintingId) {
  const { data, error } = await supabase.rpc('apply_boost', { p_painting_id: paintingId })
  if (error) throw error
  return data
}

// Move an active boost from one post to another (no balance change).
export async function reassignBoost(fromPaintingId, toPaintingId) {
  const { error } = await supabase.rpc('reassign_boost', {
    p_from_painting_id: fromPaintingId,
    p_to_painting_id: toPaintingId
  })
  if (error) throw error
  return true
}

// Caller's active boosts (for the reassign picker).
export async function getMyBoosts() {
  try {
    const { data, error } = await supabase.rpc('get_my_boosts')
    if (error) throw error
    return data || []
  } catch (e) {
    console.error('getMyBoosts error:', e)
    return []
  }
}

// Which of the given painting ids are currently boosted (for the "Boosted" badge).
// Returns a Set of painting ids.
export async function getBoostedPaintingIds(paintingIds) {
  try {
    if (!paintingIds || paintingIds.length === 0) return new Set()
    const { data, error } = await supabase.rpc('get_boosted_painting_ids', { p_ids: paintingIds })
    if (error) throw error
    return new Set((data || []).map(r => r.painting_id))
  } catch (e) {
    console.error('getBoostedPaintingIds error:', e)
    return new Set()
  }
}

// Who boosted a post — only returns rows when the caller owns the post.
export async function getPostBoosters(paintingId) {
  try {
    const { data, error } = await supabase.rpc('get_post_boosters', { p_painting_id: paintingId })
    if (error) throw error
    return data || []
  } catch (e) {
    console.error('getPostBoosters error:', e)
    return []
  }
}
