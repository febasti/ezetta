import { describe, expect, it } from 'vitest'
import { bibliographyForTypst } from './forTypst'

const keys = (...k: string[]) => new Set(k)

describe('bibliographyForTypst', () => {
  it('keeps only the cited works, each key once, and leaves out an entry that is not closed', () => {
    const text = [
      '@book{a, title = {A}, year = {2001}}',
      '@book{b, title = {B}, year = {2002}}',
      '@book{a, title = {A again}, year = {2003}}',
      '@book{broken, title = {Kaputt, year = {2004}',
    ].join('\n')
    const out = bibliographyForTypst(text, keys('a', 'broken'))!
    expect(out).toContain('@book{a, title = {A}, year = {2001}}')
    expect(out).not.toContain('A again')
    expect(out).not.toContain('@book{b')
    expect(out).not.toContain('Kaputt')
  })

  it('writes chapters and conference papers as @inbook', () => {
    const text =
      '@InCollection{c, booktitle = {Handbuch}}\n@inproceedings{p, booktitle = {Tagung}}\n@article{x, title = {X}}'
    const out = bibliographyForTypst(text, keys('c', 'p', 'x'))!
    expect(out).toContain('@inbook{c, booktitle = {Handbuch}}')
    expect(out).toContain('@inbook{p, booktitle = {Tagung}}')
    expect(out).toContain('@article{x, title = {X}}')
  })

  it('makes every year and date one the compiler reads, or leaves it out', () => {
    const text = [
      '@book{y, title = {Y}, year = {circa 1900}}',
      '@book{d, title = {D}, date = {2020-13-45}, note = {n}}',
      '@book{ok, title = {O}, date = {2020-03-01}}',
      '@book{none, title = {N}, year = {unbekannt}}',
      '@book{bare, title = {B}, year = 1999}',
    ].join('\n')
    const out = bibliographyForTypst(text, keys('y', 'd', 'ok', 'none', 'bare'))!
    expect(out).toContain('@book{y, title = {Y}, year = {1900}}')
    expect(out).toContain('@book{d, title = {D}, date = {2020}, note = {n}}')
    expect(out).toContain('date = {2020-03-01}')
    expect(out).toContain('@book{none, title = {N}}')
    expect(out).toContain('year = 1999')
  })

  it('keeps the macros and what a cited work cross-references', () => {
    const text = [
      '@string{jwr = {Journal of Writing}}',
      '@inbook{part, title = {Teil}, crossref = {whole}}',
      '@book{whole, title = {Ganzes}}',
      '@book{other, title = {Anderes}}',
    ].join('\n')
    const out = bibliographyForTypst(text, keys('part'))!
    expect(out).toContain('@string{jwr = {Journal of Writing}}')
    expect(out).toContain('@book{whole')
    expect(out).not.toContain('Anderes')
  })

  it('is null when nothing cited is in the file', () => {
    expect(bibliographyForTypst('@book{a, title = {A}}', keys('b'))).toBeNull()
  })
})
