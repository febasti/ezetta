import { describe, expect, it } from 'vitest'
import { parseTypst } from '../typst/parser'
import { MAX_UNIT, proofUnits } from './extract'
import type { ProofUnit, StandIns } from './extract'

const STAND: StandIns = {
  citation: (keys) => keys.join('; '),
  reference: (ref) => `<${ref.label}>`,
}
const units = (doc: string): ProofUnit[] => proofUnits(parseTypst(doc), doc, STAND)
/** What the checker would read, with each stand-in in place of its markup. */
const read = (unit: ProofUnit): string =>
  unit.annotation.map((p) => ('text' in p ? p.text : (p.interpretAs ?? ''))).join('')
/** The source back from the runs: they must cover the unit exactly. */
const source = (unit: ProofUnit): string =>
  unit.annotation.map((p) => ('text' in p ? p.text : p.markup)).join('')

describe('proofUnits: long paragraphs', () => {
  const sentence = 'Dies ist ein Satz, der nicht ganz kurz ist, aber auch nicht lang. '
  it('cuts a long paragraph at the ends of sentences, covering the source exactly', () => {
    const doc = `${sentence.repeat(100)}\n`
    const found = units(doc)
    expect(found.length).toBeGreaterThan(3)
    for (const unit of found) {
      expect(unit.to - unit.from).toBeLessThanOrEqual(MAX_UNIT)
      expect(source(unit)).toBe(doc.slice(unit.from, unit.to))
      expect(read(unit).endsWith('.')).toBe(true)
    }
    expect(found.map(read).join(' ')).toBe(doc.trim())
  })

  it('cuts a sentence that is itself too long at a space, and never inside a citation', () => {
    const doc = `${'wort '.repeat(200)}@smith2020[S. 4] ${'wort '.repeat(200)}ende.\n`
    const found = units(doc)
    expect(found.length).toBeGreaterThan(1)
    for (const unit of found) expect(source(unit)).toBe(doc.slice(unit.from, unit.to))
    expect(
      found.some((u) =>
        u.annotation.some((p) => 'markup' in p && p.markup.startsWith('@smith2020')),
      ),
    ).toBe(true)
  })

  it('leaves a paragraph of ordinary length whole', () => {
    expect(units(`${sentence.repeat(5)}\n`)).toHaveLength(1)
  })
})

describe('proofUnits', () => {
  it('cuts the text into paragraphs, and the runs give the source back exactly', () => {
    const doc = 'Erster Absatz mit *Betonung*.\n\nZweiter Absatz.\n'
    const found = units(doc)
    expect(found.map(read)).toEqual(['Erster Absatz mit Betonung.', 'Zweiter Absatz.'])
    for (const unit of found) expect(source(unit)).toBe(doc.slice(unit.from, unit.to))
  })

  it('treats the marks of emphasis and headings as markup', () => {
    const doc = '== Titel\nText mit _Kursiv_ und *Fett*.\n'
    const [heading, text] = units(doc)
    expect(heading!.annotation[0]).toEqual({ markup: '==' })
    expect(read(heading!).trim()).toBe('Titel')
    expect(read(text!)).toBe('Text mit Kursiv und Fett.')
  })

  it('makes each list item a unit', () => {
    const doc = '- Eins\n- Zwei\n- Drei\n'
    expect(units(doc).map((u) => read(u).trim())).toEqual(['Eins', 'Zwei', 'Drei'])
  })

  it('stands in for citations and references, and skips comments and labels', () => {
    const doc = 'Wie @smith2020 @jones2019[S. 4] zeigen (siehe @fig-a), ist es gut. // Notiz\n'
    const [unit] = units(doc)
    expect(read(unit!)).toBe('Wie smith2020; jones2019 zeigen (siehe <fig-a>), ist es gut. ')
    expect(unit!.annotation).toContainEqual({
      markup: '@smith2020 @jones2019[S. 4]',
      interpretAs: 'smith2020; jones2019',
    })
    expect(source(unit!)).toBe(doc.slice(unit!.from, unit!.to))
  })

  it('stands in for inline formulas, and drops display formulas and code', () => {
    const doc = 'Die Größe $x^2$ wächst.\n\n$ E = m c^2 $\n\n#let a = 1\nUnd `code` bleibt.\n'
    const found = units(doc)
    expect(found.map((u) => read(u).trim())).toEqual(['Die Größe x wächst.', 'Und Code bleibt.'])
  })

  it('stands in for links and keeps the text of a link', () => {
    const doc = 'Siehe https://example.org und #link("https://a.org")[diese Seite].\n'
    expect(read(units(doc)[0]!)).toBe('Siehe Link und diese Seite.')
  })

  it('reads an escaped character as the character', () => {
    expect(read(units('Kosten: 5\\$ und 3\\#\n')[0]!)).toBe('Kosten: 5$ und 3#')
  })

  it('makes the text of a footnote a unit of its own, and the marker stands for nothing', () => {
    const doc = 'Der Satz.#footnote[Eine Notiz mit @smith2020.] Weiter im Satz.\n'
    const found = units(doc)
    const main = found.find((u) => !u.footnote)!
    const note = found.find((u) => u.footnote)!
    expect(read(main)).toBe('Der Satz. Weiter im Satz.')
    expect(read(note)).toBe('Eine Notiz mit smith2020.')
    expect(source(note)).toBe(doc.slice(note.from, note.to))
    expect(doc.slice(note.from, note.to)).toBe('Eine Notiz mit @smith2020.')
    expect(source(main)).toBe(doc.slice(main.from, main.to))
  })

  it('keeps the paragraphs of a block quote apart and skips the wrapper', () => {
    const doc = '#quote(block: true)[Erste Zeile.\n\nZweite Zeile.]\n'
    expect(units(doc).map(read)).toEqual(['Erste Zeile.', 'Zweite Zeile.'])
  })

  it('does not cut inside a comment that has a blank line, nor read figures and tables', () => {
    const doc =
      'Vorher /* a\n\nb */ nachher.\n\n#figure(table(columns: 1, [Nicht prüfen]), caption: [Auch nicht]) <tbl-a>\n'
    const found = units(doc)
    expect(found.map(read)).toEqual(['Vorher  nachher.'])
  })

  it('gives no unit to a text that has no prose', () => {
    expect(units('\n\n#pagebreak()\n\n// nur Kommentar\n')).toEqual([])
  })

  it('never lets a unit break the offsets, whatever the markup', () => {
    const doc = '= A <sec-a>\n\nText #strong[fett #footnote[N]] *x*\n\n- a $b$ @c\n'
    for (const unit of units(doc)) expect(source(unit)).toBe(doc.slice(unit.from, unit.to))
  })
})
