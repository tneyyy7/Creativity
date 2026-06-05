import { supabase } from '../supabase'

// Лёгкий in-memory кэш на время сессии вкладки — чтобы тяжёлый RPC не бил в БД
// при каждом заходе на дашборд. TTL 60с; форсированный рефреш через { force: true }.
let _cache = { data: null, ts: 0 }
const TTL_MS = 60_000

/**
 * Fetches dashboard statistics via RPC.
 * This is meant to be called by admins/moderators only.
 */
export async function fetchDashboardStats({ force = false } = {}) {
  if (!force && _cache.data && Date.now() - _cache.ts < TTL_MS) {
    return _cache.data
  }

  const { data, error } = await supabase.rpc('get_admin_dashboard_stats')

  if (error) {
    console.error('Error fetching dashboard stats:', error)
    throw error
  }

  _cache = { data, ts: Date.now() }
  return data
}

export function clearDashboardStatsCache() {
  _cache = { data: null, ts: 0 }
}
