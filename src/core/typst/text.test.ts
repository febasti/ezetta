import { describe, expect, it } from 'vitest'
import { analyzeSheet, countWords } from './text'

describe('countWords', () => {
  it('counts plain prose, including umlauts and numbers', () => {
    expect(countWords('Die Größe wächst um 12 Prozent.')).toBe(6)
  })

  it('treats hyphenated and apostrophe words as one word', () => {
    expect(countWords("Hand-in-Hand don't l’art")).toBe(3)
  })

  it('ignores markup characters', () => {
    expect(countWords('= Titel <sec-intro>\n\n_betont_ und *wichtig*\n\n- Punkt\n+ eins')).toBe(6)
  })

  it('ignores block and line comments', () => {
    expect(countWords('eins /* zwei drei */ vier // fünf sechs\nsieben')).toBe(3)
  })

  it('handles nested block comments', () => {
    expect(countWords('a /* b /* c */ d */ e')).toBe(2)
  })

  it('ignores math and raw text', () => {
    expect(countWords('Die Größe $x^2 + y$ und $ E = m c^2 $ gilt `code span` ende')).toBe(5)
    expect(countWords('vor\n```\nraw block words\n```\nnach')).toBe(2)
  })

  it('counts a citation or reference as one word and drops its locator', () => {
    expect(countWords('Siehe @smith2020[S. 14] und @fig-stichprobe.')).toBe(4)
    expect(countWords('Wie #cite(<smith2020>, supplement: [S. 14]) zeigt')).toBe(3)
  })

  it('ignores labels', () => {
    expect(countWords('Text <fig-a> mehr')).toBe(2)
  })

  it('counts highlights as plain text', () => {
    expect(countWords('Die Stichprobe war ::zielgerichtet:: breit.')).toBe(5)
  })

  it('counts a bare URL as one word and does not treat // in it as a comment', () => {
    expect(countWords('Siehe https://example.org/a//b danach noch zwei')).toBe(5)
  })

  it('counts link text but not the target', () => {
    expect(countWords('Ein #link("https://example.org")[guter Link] hier')).toBe(4)
  })

  it('counts quote body text', () => {
    expect(countWords('#quote(block: true)[Zitierter Text hier.] Danach')).toBe(4)
  })

  it('skips figure and table arguments, including captions', () => {
    expect(
      countWords(
        'Vor\n#figure(\n  image("assets/a.png", width: 80%),\n  caption: [Beschriftung hier],\n) <fig-a>\nNach',
      ),
    ).toBe(2)
  })

  it('skips set, show, and let lines', () => {
    expect(countWords('#set text(size: 12pt)\n#let x = [a b c]\nEin Satz')).toBe(2)
  })

  it('is not confused by quotes and brackets inside content blocks', () => {
    expect(countWords('#quote[Er sagte "hallo] danach')).toBe(4)
  })

  it('survives unbalanced input without throwing', () => {
    for (const text of [
      '#figure(',
      '#footnote[offen',
      '/* offen',
      '$ offen',
      '`offen',
      '@',
      '#',
      '<',
      '\\',
    ]) {
      expect(() => countWords(text)).not.toThrow()
    }
  })

  it('does not count escaped characters as words', () => {
    expect(countWords('\\#kein \\@wort')).toBe(2)
  })
})

describe('footnotes', () => {
  it('counts footnote text separately from the body', () => {
    const stats = analyzeSheet('Text im Absatz.#footnote[Eine Notiz mit @smith2020.] Weiter.')
    expect(stats.words).toBe(4)
    expect(stats.footnoteWords).toBe(4)
  })

  it('handles nested brackets and citations inside footnotes', () => {
    const stats = analyzeSheet('A#footnote[Siehe [Anhang] und #link("x")[Link] hier] B')
    expect(stats.words).toBe(2)
    expect(stats.footnoteWords).toBe(5)
  })

  it('does not count comments inside footnotes', () => {
    expect(analyzeSheet('A#footnote[eins /* zwei */ drei]').footnoteWords).toBe(2)
  })
})

describe('footnote summary', () => {
  it('counts notes, and the notes after the last level-1 heading', () => {
    const stats = analyzeSheet('A#footnote[a]\n\n= H\n\nB#footnote[b] C#footnote[c]')
    expect(stats.footnotes).toBe(3)
    expect(stats.footnotesAfterChapter).toBe(2)
    const plain = analyzeSheet('A#footnote[a]')
    expect(plain.footnotes).toBe(1)
    expect(plain.footnotesAfterChapter).toBeNull()
    expect(analyzeSheet('Kein Hinweis').footnotes).toBe(0)
  })
})

describe('figure count', () => {
  it('counts figures with an image, not bare or inline images or tables', () => {
    const text =
      '#figure(image("a.png"), caption: [x])\n\n#image("b.png")\n\nText #box(image("c.png"))\n\n#figure(table([a]), caption: [t])\n\n#figure(image("d.png"))'
    expect(analyzeSheet(text).figures).toBe(2)
    expect(analyzeSheet('Kein Bild').figures).toBe(0)
  })
})

describe('title and preview', () => {
  it('are carried in the statistics', () => {
    const stats = analyzeSheet('= Einleitung <sec-a>\n\nDer erste Absatz beginnt hier.\n')
    expect(stats.title).toBe('Einleitung')
    expect(stats.preview).toEqual([
      [1, 'Einleitung'],
      [0, 'Der erste Absatz beginnt hier.'],
    ])
  })

  it('are empty for an empty sheet', () => {
    expect(analyzeSheet('')).toMatchObject({ title: '', preview: [] })
  })
})

describe('analyzeSheet: tables', () => {
  it('counts the tables that are numbered: those in a figure', () => {
    const stats = analyzeSheet(
      '#figure(table(columns: 1, [a]), caption: [C]) <tbl-a>\n\n#table(columns: 1, [b])\n\n#figure(table(columns: 1, [c])) <tbl-b>\n',
    )
    expect(stats.tables).toBe(2)
  })
})

describe('analyzeSheet: citations', () => {
  it('reports every citation and the markers, for the list of works', () => {
    const stats = analyzeSheet(
      'Erst @a und @b[S. 1]. #footnote[Mit @c.] /*#cite-needed*/ und @a/*#check*/.',
    )
    expect(stats.citations.map(([key]) => key)).toEqual(['a', 'b', 'c', 'a'])
    expect(stats.missingCitations).toHaveLength(1)
    expect(stats.citationChecks).toHaveLength(1)
  })

  it('has none for a sheet without any', () => {
    const stats = analyzeSheet('Nur Text mit mail@example.org.')
    expect(stats.citations).toEqual([])
    expect(stats.missingCitations).toEqual([])
  })
})
