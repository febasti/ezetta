import { describe, expect, it } from 'vitest'
import { parseTypst } from './parser'
import { sheetPreview } from './preview'

const preview = (doc: string) => sheetPreview(parseTypst(doc), doc)

describe('sheetPreview', () => {
  it('takes a heading as its own entry with its level, then the paragraphs', () => {
    const { title, lines } = preview(
      '= Einleitung <sec-a>\n\nDer erste Absatz\nbeginnt hier.\n\nZweiter Absatz.\n',
    )
    expect(lines).toEqual([
      [1, 'Einleitung'],
      [0, 'Der erste Absatz beginnt hier.'],
      [0, 'Zweiter Absatz.'],
    ])
    expect(title).toBe('Einleitung')
  })

  it('uses the first words as the title when there is no heading', () => {
    const { title, lines } = preview('Ein Satz ohne Überschrift.\n\n== Später\n')
    expect(title).toBe('Ein Satz ohne Überschrift.')
    expect(lines).toEqual([
      [0, 'Ein Satz ohne Überschrift.'],
      [2, 'Später'],
    ])
  })

  it('leaves out markup, comments, notes, and code, and shows formulas as a dot dot dot', () => {
    const { lines } = preview(
      '#set text(lang: "de")\n// Notiz\nEin *starker* Satz#footnote[Nicht hier] mit $x^2$ und @smith2020.\n',
    )
    expect(lines).toEqual([[0, 'Ein starker Satz mit … und @smith2020.']])
  })

  it('drops the list markers and keeps each item in the paragraph', () => {
    expect(preview('- Eins\n- Zwei\n').lines).toEqual([[0, 'Eins Zwei']])
  })

  it('is empty for an empty sheet, and for one with nothing to read', () => {
    expect(preview('')).toEqual({ title: '', lines: [] })
    expect(preview('\n\n// nur Kommentar\n#pagebreak()\n').title).toBe('')
  })

  it('is capped in entries and in length, and the title is short', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Absatz ${i}.`).join('\n\n')
    expect(preview(many).lines).toHaveLength(4)
    const long = preview(`${'wort '.repeat(200)}\n`)
    expect(long.lines[0]![1].length).toBeLessThanOrEqual(240)
    expect(long.title.length).toBeLessThanOrEqual(60)
    expect(long.title.endsWith('…')).toBe(true)
  })

  // The tree comes from the editor, so parsing is not part of what is timed.
  const timed = (doc: string): number => {
    const tree = parseTypst(doc)
    const started = performance.now()
    sheetPreview(tree, doc)
    return performance.now() - started
  }

  it('does not read the whole of a long sheet', () => {
    // It stops after the first few lines: well under a millisecond, the bound only has to
    // tell that from reading all 100,000 paragraphs.
    expect(timed(`Anfang.\n\n${'Mehr Text.\n\n'.repeat(100_000)}`)).toBeLessThan(50)
  })

  it('reads a single very long line once, not again and again', () => {
    expect(timed(`Anfang.\n\n${'Mehr Text. '.repeat(100_000)}`)).toBeLessThan(500)
  })
})
