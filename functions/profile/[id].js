import { resolveProfileMeta, injectOgTags } from '../_og-shared.js'

export async function onRequestGet(context) {
  try {
    const { params, env } = context
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
    const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
    if (!supabaseUrl || !anonKey) return context.next()

    const meta = await resolveProfileMeta(params.id, supabaseUrl, anonKey)
    return injectOgTags(context, meta)
  } catch {
    return context.next()
  }
}
