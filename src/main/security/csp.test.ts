import { describe, expect, it } from 'vitest'
import { buildCsp } from './csp'

describe('buildCsp', () => {
  it('production policy has no unsafe directives', () => {
    const csp = buildCsp({ nonce: 'abc' })
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain(`script-src 'self'`)
    expect(csp).toContain(`'nonce-abc'`)
  })
  it('development policy never allows inline script or eval', () => {
    const csp = buildCsp({ nonce: 'abc', devOrigin: 'http://localhost:5173' })
    expect(csp).toContain('ws://localhost:5173')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain(`script-src 'self'`)
  })
})
