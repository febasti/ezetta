import { describe, expect, it } from 'vitest'
import { balanced, callIn, parseArgs, stringValue, typstString } from './args'

/** Parses the argument list of the call that starts at the first "(" of `text`. */
function args(text: string) {
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  return parseArgs(text, open, close).map((a) => ({
    name: a.name,
    source: text.slice(a.from, a.to),
    value: text.slice(a.valueFrom, a.valueTo),
  }))
}

describe('parseArgs', () => {
  it('splits positional and named arguments', () => {
    expect(args('f(image("a.png"), caption: [Text], width: 80%)')).toEqual([
      { name: null, source: 'image("a.png")', value: 'image("a.png")' },
      { name: 'caption', source: 'caption: [Text]', value: '[Text]' },
      { name: 'width', source: 'width: 80%', value: '80%' },
    ])
  })

  it('is not confused by commas and brackets inside strings, content, or calls', () => {
    const result = args('f("a, b)", g(1, 2), [x, y], h: [Ein, "Text]"])')
    expect(result.map((a) => a.source)).toEqual([
      '"a, b)"',
      'g(1, 2)',
      '[x, y]',
      'h: [Ein, "Text]"]',
    ])
  })

  it('handles multi-line lists, trailing commas, and extra whitespace', () => {
    const result = args('figure(\n  image("a.png", width: 80%),\n  caption: [Beschriftung],\n)')
    expect(result.map((a) => a.source)).toEqual([
      'image("a.png", width: 80%)',
      'caption: [Beschriftung]',
    ])
  })

  it('does not take :: or a colon inside a value for a name', () => {
    expect(args('f(a::b)')[0]!.name).toBeNull()
    expect(args('f("x: y")')[0]!.name).toBeNull()
    expect(args('f(g(h: 1))')[0]!.name).toBeNull()
  })

  it('returns nothing for an empty list and survives unbalanced input', () => {
    expect(args('f()')).toEqual([])
    expect(args('f(  )')).toEqual([])
    expect(() => parseArgs('f("offen', 1, 7)).not.toThrow()
    expect(() => parseArgs('f([offen', 1, 7)).not.toThrow()
  })
})

describe('callIn', () => {
  it('reads a call that is the whole value', () => {
    const text = 'image("a.png", width: 80%)'
    expect(callIn(text, 0, text.length)).toEqual({ name: 'image', open: 5, close: text.length - 1 })
  })

  it('rejects values that are not exactly one call', () => {
    expect(callIn('image("a.png") + 1', 0, 18)).toBeNull()
    expect(callIn('"image(x)"', 0, 10)).toBeNull()
    expect(callIn('80%', 0, 3)).toBeNull()
    expect(callIn('image(', 0, 6)).toBeNull()
  })
})

describe('strings', () => {
  it('reads and writes string literals with escapes', () => {
    expect(stringValue('"assets/a.png"', 0, 14)).toBe('assets/a.png')
    expect(stringValue('"a \\"b\\" \\\\"', 0, 12)).toBe('a "b" \\')
    expect(stringValue('assets/a.png', 0, 12)).toBeNull()
    expect(stringValue('"offen', 0, 6)).toBeNull()
    expect(typstString('a "b" \\')).toBe('"a \\"b\\" \\\\"')
    expect(stringValue(typstString('x "y" \\z'), 0, typstString('x "y" \\z').length)).toBe(
      'x "y" \\z',
    )
  })
})

describe('balanced', () => {
  it('pairs square brackets and lets escaped ones stand as text', () => {
    expect(balanced('S. 1')).toBe(true)
    expect(balanced('S. [1] und [a [b]]')).toBe(true)
    expect(balanced('S. [1')).toBe(false)
    expect(balanced('S. 1]')).toBe(false)
    expect(balanced('][')).toBe(false)
    expect(balanced('S. 3\\]')).toBe(true)
    expect(balanced('\\[a')).toBe(true)
    expect(balanced('\\\\]')).toBe(false)
  })
})
