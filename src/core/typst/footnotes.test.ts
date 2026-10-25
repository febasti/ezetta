import { describe, expect, it } from 'vitest'
import {
  findFootnotes,
  footnoteAt,
  numberFootnotes,
  offsetsAfter,
  plainText,
  scanFootnotes,
  summarizeFootnotes,
} from './footnotes'
import { parseTypst } from './parser'

const scan = (doc: string) => scanFootnotes(parseTypst(doc), doc)
const texts = (doc: string): string[] =>
  findFootnotes(parseTypst(doc), doc).map((n) => doc.slice(n.contentFrom, n.contentTo))

describe('findFootnotes', () => {
  it('finds notes with their extents and inner text', () => {
    const doc = 'Satz.#footnote[Eine Notiz.] Weiter.#footnote[Zwei]'
    const notes = findFootnotes(parseTypst(doc), doc)
    expect(notes).toHaveLength(2)
    expect(doc.slice(notes[0]!.from, notes[0]!.to)).toBe('#footnote[Eine Notiz.]')
    expect(texts(doc)).toEqual(['Eine Notiz.', 'Zwei'])
  })

  it('handles brackets, code, citations, and emphasis inside a note', () => {
    expect(
      texts('A#footnote[Siehe [Anhang], `code ]` und @smith2020[S. 14] mit _Betonung_.] B'),
    ).toEqual(['Siehe [Anhang], `code ]` und @smith2020[S. 14] mit _Betonung_.'])
  })

  it('reads multi-line notes', () => {
    expect(texts('A#footnote[\n  Erste Zeile\n  zweite Zeile\n]')).toEqual([
      '\n  Erste Zeile\n  zweite Zeile\n',
    ])
  })

  it('does not count notes in comments, raw text, math, or inside other notes', () => {
    expect(texts('/* #footnote[x] */ a `#footnote[y]` b $#footnote[z]$')).toEqual([])
    expect(texts('A#footnote[außen #footnote[innen] Ende]')).toEqual([
      'außen #footnote[innen] Ende',
    ])
  })

  it('ignores a footnote without content and other functions', () => {
    expect(texts('#footnote und #fn[x] und #footnote("text")')).toEqual([])
  })

  it('counts level-1 headings before each note', () => {
    const result = scan(
      'A#footnote[a]\n\n= Eins\n\nB#footnote[b]\n\n== Unter\n\nC#footnote[c]\n\n= Zwei\n\nD#footnote[d]',
    )
    expect(result.notes.map((n) => n.chapters)).toEqual([0, 1, 1, 2])
    expect(result.chapters).toBe(2)
  })

  it('finds the note around a range', () => {
    const doc = 'A#footnote[abc] B'
    const notes = findFootnotes(parseTypst(doc), doc)
    expect(footnoteAt(notes, 12)?.from).toBe(1)
    expect(footnoteAt(notes, 1, 15)?.from).toBe(1)
    expect(footnoteAt(notes, 0)).toBeNull()
    expect(footnoteAt(notes, 16)).toBeNull()
    // At either edge a caret is outside the note.
    expect(footnoteAt(notes, 1)).toBeNull()
    expect(footnoteAt(notes, 15)).toBeNull()
  })
})

describe('plainText', () => {
  const plain = (doc: string): string => {
    const [note] = findFootnotes(parseTypst(doc), doc)
    return plainText(parseTypst(doc), doc, note!.contentFrom, note!.contentTo)
  }

  it('drops delimiters, link syntax, and comments but keeps the words', () => {
    expect(
      plain(
        'A#footnote[Ein _betontes_ und *wichtiges* Wort mit #link("https://x.example")[Link] /* weg */ hier.]',
      ),
    ).toBe(
      'Ein _betontes_ und *wichtiges* Wort mit Link hier.'.replaceAll('_', '').replaceAll('*', ''),
    )
  })

  it('collapses whitespace and line breaks, and keeps citations and math as written', () => {
    expect(plain('A#footnote[\n  Siehe @smith2020[S. 14]\n  und $x^2$.\n]')).toBe(
      'Siehe @smith2020[S. 14] und $x^2$.',
    )
  })

  it('leaves out a note inside the note', () => {
    expect(plain('A#footnote[vor #footnote[innen] nach]')).toBe('vor nach')
  })

  it('reads the same from a node that holds the range as from the whole tree', () => {
    const doc =
      'Davor.\n\n== Ein _Titel_ mit #emph[mehr]#footnote[Notiz] /* weg */ <sec-a>\n\nDanach.'
    const tree = parseTypst(doc)
    const heading = tree.topNode.getChild('Heading')!
    const from = heading.getChild('HeadingMark')!.to
    const to = doc.indexOf(' <sec-a>')
    expect(plainText(heading, doc, from, to)).toBe(plainText(tree, doc, from, to))
    expect(plainText(heading, doc, from, to)).toBe('Ein Titel mit mehr')
  })
})

describe('numbering', () => {
  const none = { offset: 0, chapterOffset: 0 }

  it('continuous numbering counts on from earlier sheets', () => {
    const notes = scan('A#footnote[a] B#footnote[b]').notes
    expect(numberFootnotes(notes, 'continuous', none)).toEqual([1, 2])
    expect(numberFootnotes(notes, 'continuous', { offset: 5, chapterOffset: 0 })).toEqual([6, 7])
  })

  it('numbering per chapter restarts at each level-1 heading', () => {
    const notes = scan(
      'A#footnote[a]\n\n= Eins\n\nB#footnote[b] C#footnote[c]\n\n= Zwei\n\nD#footnote[d]',
    ).notes
    expect(numberFootnotes(notes, 'chapter', none)).toEqual([1, 1, 2, 1])
  })

  it('notes before the first heading continue the last chapter of earlier sheets', () => {
    const notes = scan('A#footnote[a] B#footnote[b]\n\n= Neu\n\nC#footnote[c]').notes
    expect(numberFootnotes(notes, 'chapter', { offset: 9, chapterOffset: 3 })).toEqual([4, 5, 1])
  })

  it('summarizes sheets and computes the offsets after a list of sheets', () => {
    const a = summarizeFootnotes(scan('A#footnote[1] B#footnote[2]')) // no heading
    const b = summarizeFootnotes(scan('X#footnote[1]\n\n= H\n\nY#footnote[2] Z#footnote[3]')) // 2 after the heading
    const c = summarizeFootnotes(scan('Kein Hinweis'))
    expect(a).toEqual({ count: 2, afterLastChapter: null })
    expect(b).toEqual({ count: 3, afterLastChapter: 2 })
    expect(c).toEqual({ count: 0, afterLastChapter: null })
    expect(offsetsAfter([])).toEqual({ offset: 0, chapterOffset: 0 })
    expect(offsetsAfter([a, b, c])).toEqual({ offset: 5, chapterOffset: 2 })
    expect(offsetsAfter([b, a])).toEqual({ offset: 5, chapterOffset: 4 })
  })
})
