import { describe, expect, it } from 'vitest'
import { preprocessSheet } from './preprocess'
import type { PreprocessOptions } from './preprocess'

const OPTIONS: PreprocessOptions = {
  marks: 'hide',
  comments: 'remove',
  headingText: (label) => (label === 'sec-a' ? 'Abschnitt 2.1' : null),
}
const run = (text: string, options: Partial<PreprocessOptions> = {}) =>
  preprocessSheet(text, { ...OPTIONS, ...options })
const lines = (text: string): number => text.split('\n').length

describe('highlights', () => {
  it('hide: only the marks go, and the text stays', () => {
    const { text, counts } = run('Ein ::markiertes:: Wort und ::noch eins::.\n')
    expect(text).toBe('Ein markiertes Wort und noch eins.\n')
    expect(counts.highlights).toBe(2)
  })

  it('show: they become #highlight[…]', () => {
    expect(run('Ein ::Wort:: da.', { marks: 'show' }).text).toBe('Ein #highlight[Wort] da.')
  })

  it('keep the line breaks of a highlight that crosses lines', () => {
    const input = 'Ein ::langes\nWort:: da.\n'
    for (const marks of ['hide', 'show'] as const)
      expect(lines(run(input, { marks }).text)).toBe(lines(input))
  })

  it('are left alone in code, raw text, math, and strings', () => {
    const input = '`::a::` und $::b::$ und #let x = "::c::"\n'
    expect(run(input).text).toBe(input)
  })
})

describe('comments', () => {
  it('stay Typst comments when removed, and are counted; the app’s own markers are not comments', () => {
    const input =
      'Text /* prüfen */ mehr // Notiz\n@smith2020/*#check: Seite*/ und/*#cite-needed*/ ok.\n'
    const result = run(input)
    expect(result.text).toBe(input)
    expect(result.counts).toMatchObject({ comments: 2, checks: 1, missingCitations: 1 })
  })

  it('become footnotes for a review, with nothing in them read as markup', () => {
    const { text } = run('Satz /* Siehe @smith2020 und #strong[x] [eckig] */ Ende.\n', {
      comments: 'footnote',
    })
    expect(text).toBe('Satz #footnote[Siehe \\@smith2020 und \\#strong\\[x\\] \\[eckig\\]] Ende.\n')
  })

  it('keep their line breaks as footnotes, and a line comment keeps its line', () => {
    const input = 'A /* eins\nzwei */ B // drei\nC\n'
    const { text } = run(input, { comments: 'footnote' })
    expect(lines(text)).toBe(lines(input))
    expect(text).toContain('#footnote[drei]')
    expect(text.endsWith('\nC\n')).toBe(true)
  })

  it('do not become a footnote inside a footnote, and the markers never do', () => {
    const input = 'A #footnote[Note /* innen */ Text] B /*#cite-needed*/\n'
    expect(run(input, { comments: 'footnote' }).text).toBe(input)
  })

  it('leave an empty comment alone', () => {
    expect(run('A /**/ B', { comments: 'footnote' }).text).toBe('A /**/ B')
  })
})

describe('references to headings', () => {
  it('become links with the text the app worked out, in both forms', () => {
    const { text, problems } = run('Siehe @sec-a und #ref(<sec-a>) sowie @sec-a[dort].\n')
    expect(text).toBe(
      'Siehe #link(<sec-a>)[Abschnitt 2.1] und #link(<sec-a>)[Abschnitt 2.1] sowie #link(<sec-a>)[dort].\n',
    )
    expect(problems).toEqual([])
  })

  it('are reported, and left as they are, when no heading has the label', () => {
    const { text, problems } = run('A\n\nSiehe @sec-fehlt.\n')
    expect(text).toContain('@sec-fehlt')
    expect(problems).toEqual([{ kind: 'reference', label: 'sec-fehlt', line: 3 }])
  })

  it('leave references to figures, tables, and equations to Typst', () => {
    const input = 'Siehe @fig-a und @tbl-b und @eq-c.\n'
    expect(run(input).text).toBe(input)
  })
})

describe('images', () => {
  it('leaves a placeholder frame as it is: it has no file to find', () => {
    const doc = '#figure(rect(width: 100%, height: 6cm), caption: [X]) <fig-k4x9tm>\n'
    expect(run(doc).text).toContain('rect(width: 100%, height: 6cm)')
  })

  it('get a path from the root of the project, in every form', () => {
    const { text } = run(
      '#figure(image("assets/a.png", width: 80%), caption: [X]) <fig-a>\n\n#image("assets/b.png")\n\nText #box(image("assets/c.png", height: 1em))\n',
    )
    expect(text).toContain('image("/assets/a.png", width: 80%)')
    expect(text).toContain('#image("/assets/b.png")')
    expect(text).toContain('image("/assets/c.png", height: 1em)')
  })

  it('leave an absolute path and an address alone', () => {
    const input = '#image("/assets/a.png")\n\n#image("https://x.org/a.png")\n'
    expect(run(input).text).toBe(input)
  })
})

describe('everything together', () => {
  it('keeps the number of lines whatever it does', () => {
    const input = [
      '= Titel <sec-a>',
      '',
      'Ein ::Satz:: mit @sec-a und /* Notiz',
      'über zwei Zeilen */ Ende #footnote[Fuß ::x::].',
      '',
      '#image("assets/a.png")',
    ].join('\n')
    for (const marks of ['hide', 'show'] as const)
      for (const comments of ['remove', 'footnote'] as const)
        expect(lines(run(input, { marks, comments }).text)).toBe(lines(input))
  })
})
