import { describe, expect, it } from 'vitest'
import { latexToText, parseBibtex, parseName } from './bibtex'

describe('latexToText', () => {
  it('turns accents, special letters, and dashes into Unicode', () => {
    expect(latexToText('M{\\"u}ller')).toBe('Müller')
    expect(latexToText('Schr\\"{o}dinger')).toBe('Schrödinger')
    expect(latexToText('Caf\\\'e na\\"ive \\c{c}a \\v{S}koda')).toBe('Café naïve ça Škoda')
    expect(latexToText('Stra{\\ss}e \\o{} \\ae{} \\aa{}')).toBe('Straße ø æ å')
    // TeX swallows the space after a control word.
    expect(latexToText('\\o \\ae')).toBe('øæ')
    expect(latexToText('pages 12--15 and a---b')).toBe('pages 12–15 and a—b')
  })

  it('drops the braces that protect case, and keeps the text of formatting commands', () => {
    expect(latexToText('The {BibTeX} \\emph{format} \\& more \\%')).toBe(
      'The BibTeX format & more %',
    )
    expect(latexToText('a~b')).toBe('a b')
  })

  it('leaves ordinary Unicode alone', () => {
    expect(latexToText('Müller – Größe')).toBe('Müller – Größe')
  })
})

describe('parseName', () => {
  it('reads "Last, First" and "First Last"', () => {
    expect(parseName('Smith, John A.')).toEqual({
      family: 'Smith',
      given: 'John A.',
      literal: false,
    })
    expect(parseName('John A. Smith')).toEqual({
      family: 'Smith',
      given: 'John A.',
      literal: false,
    })
    expect(parseName('Smith')).toEqual({ family: 'Smith', given: '', literal: false })
  })

  it('keeps particles with the family name', () => {
    expect(parseName('Ludwig van Beethoven')).toMatchObject({
      family: 'van Beethoven',
      given: 'Ludwig',
    })
    expect(parseName('de la Cruz, Maria')).toMatchObject({ family: 'de la Cruz', given: 'Maria' })
  })

  it('reads the middle part of "Last, Jr, First" as a suffix and takes the first name last', () => {
    expect(parseName('King, Jr., Martin')).toMatchObject({ family: 'King', given: 'Martin' })
  })

  it('reads a braced name as an institution', () => {
    expect(parseName('{World Health Organization}')).toEqual({
      family: 'World Health Organization',
      given: '',
      literal: true,
    })
    expect(parseName('{A} {B}')?.literal).toBe(false)
  })

  it('reads accents in names', () => {
    expect(parseName('M{\\"u}ller, J{\\"o}rg')).toMatchObject({ family: 'Müller', given: 'Jörg' })
  })
})

const SAMPLE = `
% a comment line
@string{jcp = "Journal of Computational Physics"}
@comment{ignored @article{x, title={y}}}
@preamble{"\\newcommand{\\x}{y}"}

@article{smith2020,
  author  = {Smith, John and Jones, Mary and M{\\"u}ller, Jörg},
  title   = {A {Study} of Things: Part {II}},
  journal = jcp,
  year    = 2020,
  pages   = {1--10}
}

@book{doe2019,
  author = "Doe, Jane",
  title = "Short, titled",
  publisher = {Beispiel Verlag},
  date = {2019-05-03},
}

@techreport{who2021, author = {{World Health Organization}}, title = {Report}, year = {2021}}
@misc{many, author = {A, B and others}, title = {T}, year = {2018}}
@book{editors, editor = {Eder, Eva}, title = {Sammelband}, year = {2001}}
@online{noauthor, organization = {Amt}, title = {Seite}, year = {n.d.}}
`

describe('parseBibtex', () => {
  const { entries, problems } = parseBibtex(SAMPLE)
  const get = (key: string) => entries.find((e) => e.key === key)!

  it('reads every entry and ignores comments, preambles, and strings', () => {
    expect(entries.map((e) => e.key)).toEqual([
      'smith2020',
      'doe2019',
      'who2021',
      'many',
      'editors',
      'noauthor',
    ])
    expect(problems).toEqual([])
  })

  it('reads authors, year, title, and where the work appeared', () => {
    expect(get('smith2020')).toMatchObject({
      type: 'article',
      year: '2020',
      title: 'A Study of Things: Part II',
      container: 'Journal of Computational Physics',
      etAl: false,
    })
    expect(get('smith2020').authors.map((a) => a.family)).toEqual(['Smith', 'Jones', 'Müller'])
  })

  it('reads quoted values with commas, and the year from a date', () => {
    expect(get('doe2019')).toMatchObject({
      title: 'Short, titled',
      year: '2019',
      container: 'Beispiel Verlag',
    })
  })

  it('reads institutions, "and others", editors, and organizations', () => {
    expect(get('who2021').authors).toEqual([
      { family: 'World Health Organization', given: '', literal: true },
    ])
    expect(get('many')).toMatchObject({ etAl: true })
    expect(get('many').authors).toHaveLength(1)
    expect(get('editors').authors).toEqual([])
    expect(get('editors').editors[0]!.family).toBe('Eder')
    expect(get('noauthor').authors[0]).toMatchObject({ family: 'Amt', literal: true })
  })

  it('keeps a year that is not a number', () => {
    expect(get('noauthor').year).toBe('n.d.')
  })

  it('skips a damaged entry and a repeated key, and says where', () => {
    const result = parseBibtex(
      '@article{a, title={Ok}, year={2000}}\n@article{b, title={Open\n@article{a, title={Twice}}\n@book{c, title={Fine}}',
    )
    expect(result.entries.map((e) => e.key)).toEqual(['a', 'c'])
    expect(result.problems.some((p) => p.includes('Line 2'))).toBe(true)
    expect(result.problems.some((p) => p.includes('"a"'))).toBe(true)
  })

  it('reads an empty or meaningless file as an empty library', () => {
    expect(parseBibtex('')).toEqual({ entries: [], problems: [] })
    expect(parseBibtex('just some text with an @ sign')).toEqual({ entries: [], problems: [] })
  })

  it('handles entries in round brackets and keys with colons', () => {
    const result = parseBibtex('@book(key:1, title = {X}, year = {1999})')
    expect(result.entries[0]).toMatchObject({ key: 'key:1', year: '1999' })
  })
})
