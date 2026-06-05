// Image optimization helpers (Phase 4.2)
//
// Supabase Storage can serve resized/re-encoded images on the fly through its
// "render/image" endpoint instead of the raw "object" endpoint:
//   .../storage/v1/object/public/<bucket>/<path>      ->  original (full size)
//   .../storage/v1/render/image/public/<bucket>/<path>?width=600&quality=70
//
// We rewrite public Storage URLs to the render endpoint and append transform
// params. Any non-Supabase URL (or a URL we don't recognise) is returned
// untouched, so callers can pass arbitrary image sources safely.
//
// Note: on-the-fly transformations require image transformations to be enabled
// for the Supabase project. If they are unavailable the render endpoint simply
// returns the original bytes, so this stays safe to ship.

const PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/'
const PUBLIC_RENDER_SEGMENT = '/storage/v1/render/image/public/'

/**
 * Build an optimized variant of a Supabase Storage public URL.
 *
 * @param {string} url   original public URL
 * @param {object} opts
 * @param {number} [opts.width]   target width in px
 * @param {number} [opts.height]  target height in px
 * @param {number} [opts.quality] 20-100 (default 70)
 * @param {'cover'|'contain'|'fill'} [opts.resize='cover']
 * @returns {string} transformed URL (or the original if not transformable)
 */
export function optimizedImageUrl(url, opts = {}) {
  if (!url || typeof url !== 'string') return url
  // Only Supabase public object URLs can be transformed.
  if (!url.includes(PUBLIC_OBJECT_SEGMENT)) return url
  // Don't try to resize animated/video/gif content.
  if (/\.(gif|mp4|webm|mov)(\?|$)/i.test(url)) return url

  const { width, height, quality = 70, resize = 'cover' } = opts

  const base = url.replace(PUBLIC_OBJECT_SEGMENT, PUBLIC_RENDER_SEGMENT)
  const params = new URLSearchParams()
  if (width) params.set('width', String(Math.round(width)))
  if (height) params.set('height', String(Math.round(height)))
  if (quality) params.set('quality', String(quality))
  if (resize) params.set('resize', resize)

  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${params.toString()}`
}

/**
 * Build a `srcset` string for responsive loading at common DPR widths.
 *
 * @param {string} url
 * @param {number[]} [widths]
 * @param {object} [opts] extra transform opts (quality, resize)
 * @returns {string} e.g. "url?width=400 400w, url?width=800 800w"
 */
export function buildSrcSet(url, widths = [400, 800, 1200], opts = {}) {
  if (!url || !url.includes(PUBLIC_OBJECT_SEGMENT)) return undefined
  return widths
    .map((w) => `${optimizedImageUrl(url, { ...opts, width: w })} ${w}w`)
    .join(', ')
}

/**
 * Tiny low-quality placeholder URL (LQIP) — heavily downscaled + low quality,
 * used as a blurred background while the full image loads.
 */
export function placeholderUrl(url) {
  return optimizedImageUrl(url, { width: 24, quality: 20 })
}
