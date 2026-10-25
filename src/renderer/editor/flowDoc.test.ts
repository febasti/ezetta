import { describe, expect, it } from 'vitest'
import { buildFlow, segmentAt } from './flowDoc'

const sources = [
  { path: 'a.typ', title: 'a', content: 'Eins.\n' },
  { path: 'b.typ', title: 'b', content: '= Zwei\n\nText.\n\n\n' },
  { path: 'c.typ', title: 'c', content: '' },
]

describe('buildFlow', () => {
  it('joins sheets with a blank line and trims trailing line breaks', () => {
    expect(buildFlow(sources).doc).toBe('Eins.\n\n= Zwei\n\nText.\n\n')
  })

  it('maps segments so an offset in a segment equals the offset in the file', () => {
    const { doc, segments } = buildFlow(sources)
    expect(segments.map((s) => [s.path, s.from, s.to])).toEqual([
      ['a.typ', 0, 5],
      ['b.typ', 7, 20],
      ['c.typ', 22, 22],
    ])
    const b = segments[1]!
    expect(doc.slice(b.from, b.to)).toBe('= Zwei\n\nText.')
    expect(doc.slice(b.from, b.from + 6)).toBe(sources[1]!.content.slice(0, 6))
  })

  it('handles no sheets and keeps text exactly otherwise', () => {
    expect(buildFlow([])).toEqual({ doc: '', segments: [] })
    expect(buildFlow([{ path: 'x', title: 'x', content: 'ä\r\nö' }]).doc).toBe('ä\r\nö')
  })
})

describe('segmentAt', () => {
  const { segments } = buildFlow(sources)
  it('finds the segment of an offset, and the one before when on a separator', () => {
    expect(segmentAt(segments, 0)?.path).toBe('a.typ')
    expect(segmentAt(segments, 5)?.path).toBe('a.typ')
    expect(segmentAt(segments, 6)?.path).toBe('a.typ')
    expect(segmentAt(segments, 7)?.path).toBe('b.typ')
    expect(segmentAt(segments, 999)?.path).toBe('c.typ')
    expect(segmentAt([], 3)).toBeNull()
  })
})
