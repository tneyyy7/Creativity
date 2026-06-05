import { describe, it, expect } from 'vitest'
import { getNicknameStyle, sanitizeNickname, isValidNickname, NICKNAME_MAX_LENGTH } from './nicknameStyle'

describe('getNicknameStyle', () => {
  it('returns empty style with no color and no fallback', () => {
    expect(getNicknameStyle(null)).toEqual({})
  })

  it('maps a hard white fallback onto the theme token', () => {
    expect(getNicknameStyle(null, '#fff').color).toBe('hsl(var(--foreground))')
    expect(getNicknameStyle(null, 'white').color).toBe('hsl(var(--foreground))')
  })

  it('uses a custom fallback as-is', () => {
    expect(getNicknameStyle(null, '#ff0000')).toEqual({ color: '#ff0000' })
  })

  it('applies a background-clip trick for gradients', () => {
    const style = getNicknameStyle('linear-gradient(90deg, #f0f, #0ff)')
    expect(style.background).toContain('linear-gradient')
    expect(style.WebkitBackgroundClip).toBe('text')
    expect(style.WebkitTextFillColor).toBe('transparent')
  })

  it('uses plain color for hex values', () => {
    expect(getNicknameStyle('#123456')).toEqual({ color: '#123456' })
  })
})

describe('sanitizeNickname', () => {
  it('strips disallowed characters', () => {
    expect(sanitizeNickname('ab cd!@#')).toBe('abcd')
    expect(sanitizeNickname('Привет_world')).toBe('_world')
  })

  it('caps length at the max', () => {
    expect(sanitizeNickname('abcdefghijklmnop')).toHaveLength(NICKNAME_MAX_LENGTH)
  })

  it('keeps allowed punctuation', () => {
    expect(sanitizeNickname('a.b-c_d')).toBe('a.b-c_d')
  })

  it('handles empty/undefined', () => {
    expect(sanitizeNickname(undefined)).toBe('')
  })
})

describe('isValidNickname', () => {
  it('accepts valid nicknames', () => {
    expect(isValidNickname('john_99')).toBe(true)
    expect(isValidNickname('a')).toBe(true)
  })

  it('rejects empty, too-long, or illegal characters', () => {
    expect(isValidNickname('')).toBe(false)
    expect(isValidNickname('abcdefghijk')).toBe(false) // 11 chars
    expect(isValidNickname('hi there')).toBe(false)
    expect(isValidNickname('юзер')).toBe(false)
  })
})
