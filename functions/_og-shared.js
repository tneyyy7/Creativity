// Shared OG-tag logic for Cloudflare Pages Functions.
// Used by functions/post/[id].js and functions/profile/[id].js.

const SITE_URL = 'https://thecreativityapp.com'
const DEFAULT_IMAGE = `${SITE_URL}/icon-512.png`
const DEFAULT_DESC = 'A community for artists to share their work, get inspired, and grow.'

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

export async function resolvePostMeta(id, supabaseUrl, anonKey) {
  const p = await fetchOne(supabaseUrl, anonKey, 'paintings', id,
    'title,description,image_url,media_urls,media_type,is_nsfw,user_id')
  if (!p) return null
  const author = p.user_id
    ? await fetchOne(supabaseUrl, anonKey, 'profiles', p.user_id, 'nickname')
    : null
  const authorName = author?.nickname ? ` by @${author.nickname}` : ''
  const title = `${p.title?.trim() || 'Untitled'}${authorName} · Creativity`
  const firstMedia = Array.isArray(p.media_urls) ? p.media_urls[0] : ''
  const image = p.is_nsfw ? DEFAULT_IMAGE : (p.image_url || firstMedia || DEFAULT_IMAGE)
  return { title, description: clip(p.description) || DEFAULT_DESC, image, url: `${SITE_URL}/post/${id}`, type: 'article' }
}

export async function resolveProfileMeta(id, supabaseUrl, anonKey) {
  const u = await fetchOne(supabaseUrl, anonKey, 'profiles', id, 'nickname,bio,avatar_url')
  if (!u) return null
  const name = u.nickname ? `@${u.nickname}` : 'Artist'
  return {
    title: `${name} · Creativity`,
    description: clip(u.bio) || `${name} on Creativity — see their work.`,
    image: u.avatar_url || DEFAULT_IMAGE,
    url: `${SITE_URL}/profile/${id}`,
    type: 'profile',
  }
}

export function buildTags(meta) {
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

export async function injectOgTags(context, meta) {
  if (!meta) return context.next()

  // context.next() passes through to Cloudflare's static asset serving.
  // The _redirects rule maps /* → /index.html (200), so we get the SPA shell.
  const spaResponse = await context.next()
  if (!spaResponse || !spaResponse.ok) return spaResponse || context.next()

  let html = await spaResponse.text()
  const tags = buildTags(meta)

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
  html = html.replace(/<\/head>/i, `${tags}\n  </head>`)

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
