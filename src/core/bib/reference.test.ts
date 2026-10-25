import { describe, expect, it } from 'vitest'
import { parseBibtex } from './bibtex'
import { referencePieces, referenceText } from './reference'

const BIB = `
@article{smith2020,
  author = {Smith, John Andrew and Jones, Mary and M{\\"u}ller, J{\\"o}rg},
  title = {A Study of Things},
  journal = {Journal of Writing},
  volume = {12}, number = {3}, pages = {45--67},
  year = {2020}, doi = {10.1000/xyz123}
}
@book{doe2019,
  author = {Doe, Jane},
  title = {Qualitative Methoden},
  edition = {2}, publisher = {Beispiel Verlag}, address = {Berlin},
  year = {2019}
}
@incollection{lee2018,
  author = {Lee, Ann},
  title = {Ein Kapitel},
  editor = {Klein, Peter and Groß, Eva},
  booktitle = {Handbuch der Forschung},
  pages = {10--20}, publisher = {Springer}, year = {2018}
}
@phdthesis{roe2021,
  author = {Roe, Max},
  title = {Über das Schreiben},
  school = {Universität Wien}, year = {2021}
}
@book{edited,
  editor = {Weber, Karl},
  title = {Sammelband}, publisher = {Verlag}, year = {2017}
}
@misc{who,
  author = {{World Health Organization}},
  title = {Report on Health}, url = {https://who.int/report}
}
`
const library = parseBibtex(BIB)
const entry = (key: string) => library.entries.find((e) => e.key === key)!

describe('referenceText', () => {
  it('writes an article with every author, the journal, volume, issue, pages, and the DOI', () => {
    expect(referenceText(entry('smith2020'), 'de')).toBe(
      'Smith, J. A., Jones, M., & Müller, J. (2020). A Study of Things. Journal of Writing, 12(3), 45–67. https://doi.org/10.1000/xyz123',
    )
    const pieces = referencePieces(entry('smith2020'), 'de')
    expect(pieces.filter((p) => p.italic).map((p) => p.text)).toEqual(['Journal of Writing', '12'])
    expect(pieces.at(-1)).toEqual({ text: 'https://doi.org/10.1000/xyz123', link: true })
  })

  it('writes a book with its title in italics, the edition, and the publisher', () => {
    expect(referenceText(entry('doe2019'), 'de')).toBe(
      'Doe, J. (2019). Qualitative Methoden (2. Aufl.). Beispiel Verlag.',
    )
    expect(referenceText(entry('doe2019'), 'en')).toBe(
      'Doe, J. (2019). Qualitative Methoden (2nd ed.). Beispiel Verlag.',
    )
    expect(referencePieces(entry('doe2019'), 'de').find((p) => p.italic)?.text).toBe(
      'Qualitative Methoden',
    )
  })

  it('writes a chapter with the editors and the book it is in', () => {
    expect(referenceText(entry('lee2018'), 'de')).toBe(
      'Lee, A. (2018). Ein Kapitel. In P. Klein & E. Groß (Hrsg.), Handbuch der Forschung (S. 10–20). Springer.',
    )
  })

  it('writes a thesis with its kind and university', () => {
    expect(referenceText(entry('roe2021'), 'de')).toBe(
      'Roe, M. (2021). Über das Schreiben [Dissertation, Universität Wien].',
    )
  })

  it('keeps the comma before "&" between two authors, but not between two editors', () => {
    const two = parseBibtex(
      '@book{t, author = {Jones, Mary and Müller, Jörg}, title = {B}, year = {2019}}',
    ).entries[0]!
    expect(referenceText(two, 'de')).toBe('Jones, M., & Müller, J. (2019). B.')
    expect(referenceText(entry('lee2018'), 'de')).toContain('In P. Klein & E. Groß (Hrsg.)')
  })

  it('puts the editors first when there are no authors, and says when there is no year', () => {
    expect(referenceText(entry('edited'), 'de')).toBe(
      'Weber, K. (Hrsg.). (2017). Sammelband. Verlag.',
    )
    expect(referenceText(entry('who'), 'de')).toBe(
      'World Health Organization. (o. J.). Report on Health. https://who.int/report',
    )
    expect(referenceText(entry('who'), 'en')).toContain('(n.d.)')
  })

  it('makes do with what an entry has', () => {
    const bare = parseBibtex('@misc{x, title = {Nur ein Titel}}').entries[0]!
    expect(referenceText(bare, 'de')).toBe('Nur ein Titel. (o. J.).')
  })
})
