import { describe, it, expect } from 'vitest'
import { optimizedImageUrl, buildSrcSet, placeholderUrl } from './imageTransform'

const PUBLIC = 'https://proj.supabase.co/storage/v1/object/public/paintings/u/cover.jpg'
const RENDER = 'https://proj.supabase.co/storage/v1/render/image/public/paintings/u/cover.jpg'

describe('optimizedImageUrl', () => {
  it('rewrites object URLs to the render endpoint with transform params', () => {
    const out = optimizedImageUrl(PUBLIC, { width: 600, quality: 70 })
    expect(out.startsWith(RENDER)).toBe(true)
    expect(out).toContain('width=600')
    expect(out).toContain('quality=70')
    expect(out).toContain('resize=cover')
  })

  it('rounds fractional widths', () => {
    expect(optimizedImageUrl(PUBLIC, { width: 399.6 })).toContain('width=400')
  })

  it('returns non-Supabase URLs untouched', () => {
    const ext = 'https://cdn.example.com/a.jpg'
    expect(optimizedImageUrl(ext, { width: 600 })).toBe(ext)
  })

  it('leaves blob/local preview URLs untouched', () => {
    const blob = 'blob:http://localhost/abc-123'
    expect(optimizedImageUrl(blob, { width: 600 })).toBe(blob)
  })

  it('does not transform video/gif assets', () => {
    const vid = PUBLIC.replace('cover.jpg', 'clip.mp4')
    expect(optimizedImageUrl(vid, { width: 600 })).toBe(vid)
  })

  it('handles null/undefined safely', () => {
    expect(optimizedImageUrl(null)).toBe(null)
    expect(optimizedImageUrl(undefined)).toBe(undefined)
    expect(optimizedImageUrl('')).toBe('')
  })
})

describe('buildSrcSet', () => {
  it('emits a width-descriptor srcset for each width', () => {
    const srcset = buildSrcSet(PUBLIC, [400, 800])
    expect(srcset).toContain('width=400')
    expect(srcset).toContain(' 400w')
    expect(srcset).toContain('width=800')
    expect(srcset).toContain(' 800w')
    expect(srcset.split(',')).toHaveLength(2)
  })

  it('returns undefined for non-transformable URLs', () => {
    expect(buildSrcSet('https://cdn.example.com/a.jpg')).toBeUndefined()
  })
})

describe('placeholderUrl', () => {
  it('produces a tiny low-quality variant', () => {
    const lqip = placeholderUrl(PUBLIC)
    expect(lqip).toContain('width=24')
    expect(lqip).toContain('quality=20')
  })
})
