import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from './external'

describe('isAllowedExternalUrl', () => {
  it('allows https and mailto', () => {
    expect(isAllowedExternalUrl('https://example.org/a')).toBe(true)
    expect(isAllowedExternalUrl('mailto:a@example.org')).toBe(true)
  })
  it('rejects everything else', () => {
    for (const url of [
      'http://example.org',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'app://renderer/',
      'nonsense',
    ]) {
      expect(isAllowedExternalUrl(url)).toBe(false)
    }
  })
})
