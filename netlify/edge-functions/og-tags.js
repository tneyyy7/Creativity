// Dynamic Open Graph tags for shared links.
//
// The SPA ships a static index.html with no per-page <meta og:*> tags, so every
// shared /post/:id or /profile/:id link previewed flat (empty card) on Telegram,
// Twitter, Facebook, Slack, iMessage — killing the growth loop that Share is
// supposed to drive.
//
// This Netlify Edge Function runs at the CDN for /post/* and /profile/*, fetches
// the entity from Supabase REST (anon key — RLS already allows public reads, the
// same query the client makes) and injects og:/twitter: tags into the HTML head
// before it reaches the crawler. React still mounts into #root untouched.
//
// It serves the enriched HTML to everyone (not just bots): simpler than fragile
// User-Agent sniffing, and it doubles as SEO. On any failure it falls back to the
// untouched SPA shell so a bad fetch never breaks the page.

const SITE_URL = 'https://thecreativityapp.com'
const DEFAULT_IMAGE = `${SITE_URL}/icon-512.png`
const DEFAULT_TITLE = 'Creativity — Painter\'s Companion'
const DEFAULT_DESC = 'A community for artists to share their work, get inspired, and grow.'

const env = (key) => {
  try {
    // eslint-disable-next-line no-undef
    return (typeof Netlify !== 'undefined' && Netlify.env?.get(key)) ||
      // eslint-disable-next-line no-undef
      (typeof Deno !== 'undefined' && Deno.env?.get(key)) ||
      (typeof process !== 'undefined' && process.env?.[key]) || ''
  } catch {
    return ''
  }
}

const SUPABASE_URL = env('VITE_SUPABASE_URL') || env('SUPABASE_URL')
const SUPABASE_ANON_KEY = env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY')

// Escape for safe insertion into an HTML attribute value.
const esc = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// Trim a description to a sane preview length on a word boundary.
const clip = (str = '', max = 200) => {
  const s = String(str).replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

async function fetchOne(table, id, select) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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

// Resolve the requested path into OG metadata, or null to leave HTML untouched.
async function resolveMeta(pathname) {
  const post = pathname.match(/^\/post\/([^/?#]+)/)
  if (post) {
    const p = await fetchOne(
      'paintings',
      post[1],
      'title,description,image_url,media_urls,media_type,is_nsfw,user_id'
    )
    if (!p) return null
    let author = null
    if (p.user_id) {
      author = await fetchOne('profiles', p.user_id, 'nickname')
    }
    const authorName = author?.nickname ? ` by @${author.nickname}` : ''
    const title = `${p.title?.trim() || 'Untitled'}${authorName} · Creativity`
    const firstMedia = Array.isArray(p.media_urls) ? p.media_urls[0] : ''
    // Hide NSFW previews from crawlers; fall back to the site icon.
    const image = p.is_nsfw
      ? DEFAULT_IMAGE
      : (p.image_url || firstMedia || DEFAULT_IMAGE)
    return {
      title,
      description: clip(p.description) || DEFAULT_DESC,
      image,
      url: `${SITE_URL}${pathname}`,
      type: 'article',
    }
  }

  const profile = pathname.match(/^\/profile\/([^/?#]+)/)
  if (profile) {
    const u = await fetchOne('profiles', profile[1], 'nickname,bio,avatar_url')
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

    const meta = await resolveMeta(pathname)
    if (!meta) return response

    let html = await response.text()
    const tags = buildTags(meta)

    // Replace the static <title> so it matches, then inject OG tags into <head>.
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
