// Dynamic Open Graph tags for shared links.
//
// The SPA ships a static index.html with no per-page <meta og:*> tags, so every
// shared /post/:id or /profile/:id link previewed flat on Telegram, Twitter,
// Facebook, Slack, iMessage — killing the growth loop that Share is supposed to drive.
//
// This Netlify Edge Function runs on Deno at the CDN for /post/* and /profile/*,
// fetches the entity from Supabase REST (anon key — RLS already allows public reads)
// and injects og:/twitter: tags into the HTML head. React still mounts into #root untouched.
//
// On any failure it falls back to the untouched SPA shell so a bad fetch never breaks the page.

const SITE_URL = 'https://thecreativityapp.com'
const DEFAULT_IMAGE = `${SITE_URL}/icon-512.png`
const DEFAULT_DESC = 'A community for artists to share their work, get inspired, and grow.'

// Read env inside handler (Netlify global is only guaranteed inside the request context).
function getEnv(key) {
  try {
    // eslint-disable-next-line no-undef
    if (typeof Netlify !== 'undefined') return Netlify.env.get(key) || ''
    // eslint-disable-next-line no-undef
    if (typeof Deno !== 'undefined') return Deno.env.get(key) || ''
  } catch { /* empty */ }
  return ''
}

const esc = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const clip = (str = '', max = 200) => {
  const s = String(str).replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

async function fetchOne(supabaseUrl, anonKey, table, id, select) {
  const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`
  try {
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch {
    return null
  }
}

async function resolveMeta(pathname, supabaseUrl, anonKey) {
  const postMatch = pathname.match(/^\/post\/([^/?#]+)/)
  if (postMatch) {
    const p = await fetchOne(supabaseUrl, anonKey, 'paintings', postMatch[1],
      'title,description,image_url,media_urls,media_type,is_nsfw,user_id')
    if (!p) return null
    const author = p.user_id
      ? await fetchOne(supabaseUrl, anonKey, 'profiles', p.user_id, 'nickname')
      : null
    const authorName = author?.nickname ? ` by @${author.nickname}` : ''
    const title = `${p.title?.trim() || 'Untitled'}${authorName} · Creativity`
    const firstMedia = Array.isArray(p.media_urls) ? p.media_urls[0] : ''
    const image = p.is_nsfw ? DEFAULT_IMAGE : (p.image_url || firstMedia || DEFAULT_IMAGE)
    return { title, description: clip(p.description) || DEFAULT_DESC, image, url: `${SITE_URL}${pathname}`, type: 'article' }
  }

  const profileMatch = pathname.match(/^\/profile\/([^/?#]+)/)
  if (profileMatch) {
    const u = await fetchOne(supabaseUrl, anonKey, 'profiles', profileMatch[1], 'nickname,bio,avatar_url')
    if (!u) return null
    const name = u.nickname ? `@${u.nickname}` : 'Artist'
    return {
      title: `${name} · Creativity`,
      description: clip(u.bio) || `${name} on Creativity — see their work.`,
      image: u.avatar_url || DEFAULT_IMAGE,
      url: `${SITE_URL}${pathname}`,
      type: 'profile',
    }
  }

  return null
}

function buildTags(meta) {
  const t = esc(meta.title)
  const d = esc(meta.description)
  const img = esc(meta.image)
  const url = esc(meta.url)
  return `
    <meta property="og:type" content="${meta.type}" />
    <meta property="og:site_name" content="Creativity" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
    <meta name="description" content="${d}" />`
}

export default async function handler(request, context) {
  const response = await context.next()

  try {
    const { pathname } = new URL(request.url)
    if (!/^\/(post|profile)\//.test(pathname)) return response

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return response

    // Read env vars inside handler — Netlify global is guaranteed here.
    const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL')
    const anonKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) return response

    const meta = await resolveMeta(pathname, supabaseUrl, anonKey)
    if (!meta) return response

    let html = await response.text()
    const tags = buildTags(meta)

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
    html = html.replace(/<\/head>/i, `${tags}\n  </head>`)

    return new Response(html, {
      status: response.status,
      headers: response.headers,
    })
  } catch {
    return response
  }
}

export const config = {
  path: ['/post/*', '/profile/*'],
}
