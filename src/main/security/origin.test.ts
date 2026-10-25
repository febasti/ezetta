import { describe, expect, it } from 'vitest'
import { isTrustedUrl, originOf } from './origin'

const trusted = ['app://renderer']

describe('originOf', () => {
  it('builds origins for custom schemes', () => {
    expect(originOf('app://renderer/index.html')).toBe('app://renderer')
    expect(originOf('http://localhost:5173/')).toBe('http://localhost:5173')
  })
  it('returns null for garbage', () => {
    expect(originOf('not a url')).toBeNull()
  })
})

describe('isTrustedUrl', () => {
  it('accepts the app origin only', () => {
    expect(isTrustedUrl('app://renderer/index.html', trusted)).toBe(true)
    expect(isTrustedUrl('app://evil/index.html', trusted)).toBe(false)
    expect(isTrustedUrl('https://renderer/', trusted)).toBe(false)
    expect(isTrustedUrl('file:///etc/passwd', trusted)).toBe(false)
    expect(isTrustedUrl('', trusted)).toBe(false)
    expect(isTrustedUrl(null, trusted)).toBe(false)
  })
  it('does not accept look-alike hosts', () => {
    expect(isTrustedUrl('app://renderer.evil.example/', trusted)).toBe(false)
    expect(isTrustedUrl('app://renderer@evil/', trusted)).toBe(false)
  })
})
