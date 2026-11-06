import { describe, expect, it } from 'vitest'
import type { EditInput, EditResult } from './edit'
import { gapAt, joinBackward, joinForward, lineBreak, newParagraph, typeOnGap } from './paragraphs'
import { parseTypst } from './parser'

/** `«…»` marks a selection and `|` a caret; the result shows the caret as `|`, or null. */
function run(source: string, command: (input: EditInput) => EditResult | null): string | null {
  let doc = source
  let from: number
  let to: number
  const open = doc.indexOf('«')
  if (open >= 0) {
    doc = doc.replace('«', '')
    to = doc.indexOf('»')
    doc = doc.replace('»', '')
    from = open
  } else {
    from = to = doc.indexOf('|')
    doc = doc.replace('|', '')
  }
  const result = command({ doc, tree: parseTypst(doc), from, to })
  if (!result) return null
  let out = doc
  for (const c of [...result.changes].sort((a, b) => b.from - a.from))
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  return `${out.slice(0, result.head)}|${out.slice(result.head)}`
}

describe('Enter', () => {
  const enter = (s: string) => run(s, newParagraph)

  it('starts a new paragraph behind an empty line', () => {
    expect(enter('Eins.|')).toBe('Eins.\n\n|')
    expect(enter('Ein|s.')).toBe('Ein\n\n|s.')
    expect(enter('== Titel|')).toBe('== Titel\n\n|')
  })

  it('leaves no space at the end of the paragraph', () => {
    expect(enter('Eins. |Zwei.')).toBe('Eins.\n\n|Zwei.')
  })

  it('pushes a paragraph down from its start with one line break', () => {
    expect(enter('Eins.\n\n|Zwei.')).toBe('Eins.\n\n\n|Zwei.')
    expect(enter('|Eins.')).toBe('\n|Eins.')
  })

  it('makes an empty paragraph between two', () => {
    expect(enter('Eins.|\n\nZwei.')).toBe('Eins.\n\n|\n\nZwei.')
  })

  it('replaces a selection', () => {
    expect(enter('Ein«s. Zw»ei.')).toBe('Ein\n\n|ei.')
  })

  it('starts a paragraph inside a block quote', () => {
    expect(enter('#quote(block: true)[Eins.|]')).toBe('#quote(block: true)[Eins.\n\n|]')
  })

  it('is left to the editor in code, math, raw text and comments', () => {
    expect(enter('```\nzeile|\n```')).toBeNull()
    expect(enter('$ x |+ y $')).toBeNull()
    expect(enter('/* ein |Kommentar */')).toBeNull()
  })
})

describe('Shift+Enter', () => {
  const shiftEnter = (s: string) => run(s, lineBreak)

  it('writes a line break the reader sees', () => {
    expect(shiftEnter('Eins.|')).toBe('Eins. \\\n|')
    expect(shiftEnter('Eins. |Zwei.')).toBe('Eins. \\\n|Zwei.')
  })

  it('keeps the next line in a list item, and is a new paragraph in a heading', () => {
    expect(shiftEnter('- Eins|')).toBe('- Eins \\\n  |')
    expect(shiftEnter('  + Eins|')).toBe('  + Eins \\\n    |')
    expect(shiftEnter('== Titel|')).toBe('== Titel\n\n|')
  })

  it('is left to the editor in raw text', () => {
    expect(shiftEnter('`a|b`')).toBeNull()
  })
})

describe('Backspace and Delete between paragraphs', () => {
  const back = (s: string) => run(s, joinBackward)
  const del = (s: string) => run(s, joinForward)

  it('join two paragraphs in one press', () => {
    expect(back('Eins.\n\n|Zwei.')).toBe('Eins.|Zwei.')
    expect(back('Eins.\n\n|')).toBe('Eins.|')
    expect(del('Eins.|\n\n')).toBe('Eins.|')
    expect(del('Eins.|\n\nZwei.')).toBe('Eins.|Zwei.')
    expect(del('Eins.|\n\n#emph[Zwei] und drei.')).toBe('Eins.|#emph[Zwei] und drei.')
  })

  it('are left to the editor everywhere else', () => {
    expect(back('Eins.\nZw|ei.')).toBeNull()
    expect(back('Eins.\n|Zwei.')).toBeNull()
    expect(back('Eins.\n\n\n|Zwei.')).toBeNull()
    expect(back('- eins\n\n|- zwei')).toBeNull()
    expect(back('Eins.\n\n|== Titel')).toBeNull()
    expect(back('#figure(\n  image("a.png"),\n) <fig-a>\n\n|Text.')).toBeNull()
    expect(del('Eins.|\n\n#figure(\n  image("a.png"),\n) <fig-a>')).toBeNull()
    expect(del('Eins.|\n\n$ x $ <eq-a>')).toBeNull()
    expect(del('Eins.|\n\n#quote(block: true)[Zwei.]')).toBeNull()
    expect(back('«Eins.\n\nZwei.»')).toBeNull()
    expect(del('Eins.|\nZwei.')).toBeNull()
    expect(del('Ein|s.\n\nZwei.')).toBeNull()
    expect(del('Eins.|\n')).toBeNull()
  })
})

describe('typing on the empty line after a paragraph', () => {
  const type = (s: string) => run(s, (input) => typeOnGap(input, 'X'))

  it('starts a paragraph of its own instead of joining the one above', () => {
    expect(type('Eins.\n|')).toBe('Eins.\n\nX|')
    expect(type('Eins.\n|\nZwei.')).toBe('Eins.\n\nX|\n\nZwei.')
    expect(type('Eins.\n|\n\nZwei.')).toBe('Eins.\n\nX|\n\nZwei.')
  })

  it('leaves every other line to the editor', () => {
    expect(type('Eins.\n\n|')).toBeNull()
    expect(type('Eins. \\\n|')).toBeNull()
    expect(type('|')).toBeNull()
    expect(type('Eins.|')).toBeNull()
    expect(type('```\nzeile\n|\n```')).toBeNull()
    expect(type('#figure(\n  table(columns: 1, [A]),\n) <tbl-a>\n|')).toBeNull()
    expect(type('#quote(block: true)[Eins.]\n|')).toBeNull()
    expect(type('$ x $ <eq-a>\n|')).toBeNull()
  })

  it('starts a paragraph after text that ends in a call', () => {
    expect(type('Text mit #emph[x]\n|')).toBe('Text mit #emph[x]\n\nX|')
  })
})

describe('the empty line between two paragraphs', () => {
  const gap = (s: string) => {
    const pos = s.indexOf('|')
    const doc = s.replace('|', '')
    return gapAt({ doc, tree: parseTypst(doc) }, pos)
  }

  it('sends the caret to the end of the paragraph above or the start of the one below', () => {
    expect(gap('Eins.\n|\nZwei.')).toEqual({ before: 5, after: 7 })
    expect(gap('Eins.\n|\n\nVier.')).toEqual({ before: 5, after: 7 })
  })

  it('is not about any other line', () => {
    expect(gap('Eins.\n|')).toBeNull()
    expect(gap('Eins.\n\n|\nVier.')).toBeNull()
    expect(gap('|\nZwei.')).toBeNull()
    expect(gap('Ei|ns.\n\nZwei.')).toBeNull()
    expect(gap('#quote(block: true)[Eins.]\n|\nZwei.')).toBeNull()
    expect(gap('```\nEins\n|\nZwei\n```')).toBeNull()
  })
})
