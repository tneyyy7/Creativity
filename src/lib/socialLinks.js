// Link-in-bio: the fixed set of social platforms a user can attach to their
// profile (Sprint 1.2). Values are stored in profiles.social_links as
// { instagram, x, tiktok, youtube } → full URLs.
//
// Icons: lucide ships Instagram / Twitter / Youtube but no TikTok or X-brand
// glyph, so we map x→Twitter and tiktok→Music2 as close stand-ins.
import { Instagram, Twitter, Youtube, Music2 } from 'lucide-react'

// Order here is the render order of the icon row.
export const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, base: 'https://instagram.com/', placeholder: 'instagram.com/username' },
  { key: 'x', label: 'X', icon: Twitter, base: 'https://x.com/', placeholder: 'x.com/username' },
  { key: 'tiktok', label: 'TikTok', icon: Music2, base: 'https://tiktok.com/@', placeholder: 'tiktok.com/@username' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, base: 'https://youtube.com/@', placeholder: 'youtube.com/@channel' },
]

// Normalize a user-entered value into a safe absolute https URL, or '' to clear.
// Accepts a full URL, a bare domain, or a plain handle (e.g. "@me" / "me").
export function normalizeSocialUrl(platform, raw) {
  const value = (raw || '').trim()
  if (!value) return ''
  // Already an absolute URL — only allow http(s) to avoid javascript:/data: etc.
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
    } catch {
      return ''
    }
  }
  // Looks like a domain (contains a dot, no spaces) — just add https://
  if (/^[^\s]+\.[^\s]+$/.test(value) && !value.startsWith('@')) {
    return `https://${value}`
  }
  // Treat as a bare handle for the given platform.
  const cfg = SOCIAL_PLATFORMS.find(p => p.key === platform)
  if (!cfg) return ''
  const handle = value.replace(/^@/, '')
  return `${cfg.base}${handle}`
}

// Build the ordered list of { key, label, icon, url } entries that actually have
// a value, for rendering the profile icon row.
export function getActiveSocialLinks(socialLinks) {
  if (!socialLinks || typeof socialLinks !== 'object') return []
  return SOCIAL_PLATFORMS
    .filter(p => typeof socialLinks[p.key] === 'string' && socialLinks[p.key].trim())
    .map(p => ({ ...p, url: socialLinks[p.key].trim() }))
}
