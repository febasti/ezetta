import { describe, expect, it } from 'vitest'
import { DIVIDER_SOURCE, scanDividers } from './dividers'
import { parseTypst } from './parser'

const scan = (doc: string): string[] =>
  scanDividers(parseTypst(doc), doc).map(({ from, to }) => doc.slice(from, to))

describe('scanDividers', () => {
  it('finds a divider on a line of its own, and with spaces in its parentheses', () => {
    expect(scan(`A\n\n${DIVIDER_SOURCE}\n\nB\n\n#divider( )`)).toEqual([
      '#divider()',
      '#divider( )',
    ])
  })

  it('finds a divider beside text too (the editor leaves that one as source)', () => {
    expect(scan('Text #divider() Text')).toEqual(['#divider()'])
  })

  it('leaves out calls with arguments or content, a bare name, and code, math or raw text', () => {
    for (const doc of [
      '#divider(x)',
      '#divider()[a]',
      '#divider',
      '#divider(\n)',
      '`#divider()`',
      '$#divider()$',
      '/* #divider() */',
      '#mydivider()',
    ])
      expect(scan(doc)).toEqual([])
  })
})
