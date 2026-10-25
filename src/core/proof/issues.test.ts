import { describe, expect, it } from 'vitest'
import { parseTypst } from '../typst/parser'
import { proofUnits } from './extract'
import {
  CONTEXT_CHARS,
  contextParts,
  categoryOf,
  checkerLanguage,
  ignoreKey,
  issuesOf,
  keepIssue,
  parseDictionary,
  withWord,
} from './issues'
import type { CheckerMatch, IssueFilter } from './issues'

const match = (offset: number, length: number, rule = 'R', type = 'misspelling'): CheckerMatch => ({
  offset,
  length,
  message: 'm',
  replacements: [{ value: 'x' }],
  rule: { id: rule, description: 'd', issueType: type, category: { id: 'TYPOS', name: 'Typos' } },
})
const stand = { citation: () => 'Smith 2020', reference: () => 'Abbildung 1' }
const FILTER: IssueFilter = {
  words: new Set(),
  disabledRules: new Set(),
  disabledCategories: new Set(),
  ignored: new Set(),
}

describe('issuesOf', () => {
  it('puts the checker’s offsets into the source', () => {
    const doc = 'Eins.\n\nEin Tesst und @smith2020 hier.\n'
    const unit = proofUnits(parseTypst(doc), doc, stand)[1]!
    const [issue] = issuesOf(unit, [match(4, 5)], doc)
    expect(doc.slice(issue!.from, issue!.to)).toBe('Tesst')
    expect(issue).toMatchObject({ text: 'Tesst', category: 'spelling', footnote: false })
    expect(issue!.context).toBe('Ein Tesst und @smith2020 hier.')
  })

  it('drops a match that lies wholly in a stand-in', () => {
    const doc = 'Wie @smith2020 zeigt.\n'
    const unit = proofUnits(parseTypst(doc), doc, stand)[0]!
    expect(issuesOf(unit, [match(4, 10)], doc)).toEqual([])
    expect(issuesOf(unit, [match(0, 3)], doc)).toHaveLength(1)
  })

  it('ignores matches outside the unit', () => {
    const doc = 'Kurz.\n'
    const unit = proofUnits(parseTypst(doc), doc, stand)[0]!
    expect(issuesOf(unit, [match(3, 40), match(0, 0)], doc)).toEqual([])
  })
})

describe('categoryOf', () => {
  it('sorts the checker’s types into four categories', () => {
    const type = (issueType: string, id = 'X') => ({
      ...match(0, 1, 'R', issueType),
      rule: { id: 'R', description: '', issueType, category: { id, name: '' } },
    })
    expect(categoryOf(type('misspelling'))).toBe('spelling')
    expect(categoryOf(type('typographical'))).toBe('typography')
    expect(categoryOf(type('style'))).toBe('style')
    expect(categoryOf(type('uncategorized', 'CASING'))).toBe('grammar')
    expect(categoryOf(type('grammar'))).toBe('grammar')
  })
})

describe('keepIssue', () => {
  const doc = 'Ein Tesst.\n'
  const unit = proofUnits(parseTypst(doc), doc, stand)[0]!
  const [issue] = issuesOf(unit, [match(4, 5, 'SPELL')], doc)

  it('keeps an issue nothing speaks against', () => {
    expect(keepIssue(issue!, FILTER)).toBe(true)
  })
  it('drops words of a dictionary, in the case written or in lower case', () => {
    expect(keepIssue(issue!, { ...FILTER, words: new Set(['Tesst']) })).toBe(false)
    expect(keepIssue(issue!, { ...FILTER, words: new Set(['tesst']) })).toBe(false)
  })
  it('drops disabled rules and categories, and ignored occurrences', () => {
    expect(keepIssue(issue!, { ...FILTER, disabledRules: new Set(['SPELL']) })).toBe(false)
    expect(keepIssue(issue!, { ...FILTER, disabledCategories: new Set(['spelling']) })).toBe(false)
    expect(keepIssue(issue!, { ...FILTER, ignored: new Set([ignoreKey(issue!)]) })).toBe(false)
  })
  it('does not apply the dictionary to other categories', () => {
    const grammar = { ...issue!, category: 'grammar' as const }
    expect(keepIssue(grammar, { ...FILTER, words: new Set(['Tesst']) })).toBe(true)
  })
})

describe('dictionaries', () => {
  it('reads one word per line and leaves comments out', () => {
    expect(parseDictionary('# Begriffe\nHabitus\n\n  Feld  \r\nDoxa\n')).toEqual([
      'Habitus',
      'Feld',
      'Doxa',
    ])
  })
  it('adds a word on a line of its own, once', () => {
    expect(withWord('', 'Habitus')).toBe('Habitus\n')
    expect(withWord('Feld', 'Habitus')).toBe('Feld\nHabitus\n')
    expect(withWord('Feld\n', 'Feld')).toBeNull()
    expect(withWord('Feld\n', '  ')).toBeNull()
    expect(withWord('Feld\n', 'a\nb')).toBeNull()
  })
})

describe('checkerLanguage', () => {
  it('uses the setting, or the usual variant of the project language', () => {
    expect(checkerLanguage('de')).toBe('de-DE')
    expect(checkerLanguage('en')).toBe('en-GB')
    expect(checkerLanguage('de', 'de-AT')).toBe('de-AT')
    expect(checkerLanguage('de-ch')).toBe('de-CH')
    expect(checkerLanguage('de', 'nonsense!')).toBe('de-DE')
  })
})

describe('suggestions', () => {
  const stand2 = { citation: () => 'Smith 2020', reference: () => 'Abbildung 1' }
  it('are left out where they would touch markup or add some', () => {
    const doc = 'Ein Tesst @smith2020 hier.\n'
    const unit = proofUnits(parseTypst(doc), doc, stand2)[0]!
    const withSpecial: CheckerMatch = {
      ...match(4, 5),
      replacements: [{ value: 'Test' }, { value: '*Test*' }, { value: 'a#b' }],
    }
    expect(issuesOf(unit, [withSpecial], doc)[0]!.replacements).toEqual(['Test'])
    // A match that runs into the citation keeps its message but offers nothing to apply.
    const across: CheckerMatch = { ...match(8, 4), replacements: [{ value: 'Foo' }] }
    expect(issuesOf(unit, [across], doc)[0]!.replacements).toEqual([])
  })
})

describe('contextParts', () => {
  it('splits the context around the covered words', () => {
    expect(contextParts({ context: 'Das ist ein Tesst mit Text.', text: 'Tesst' })).toEqual([
      'Das ist ein ',
      'Tesst',
      ' mit Text.',
    ])
    expect(contextParts({ context: 'anderes', text: 'Tesst' })).toEqual(['', 'Tesst', ''])
  })

  it('drops the partial word at a cut end and marks it with an ellipsis', () => {
    const before = 'xt2020. Er gehen nach Hause. Das ist ein '.slice(-CONTEXT_CHARS)
    const after = ' langer Satz mit Fehlern in der Rechtschreibung'.slice(0, CONTEXT_CHARS)
    expect(before).toHaveLength(CONTEXT_CHARS)
    expect(after).toHaveLength(CONTEXT_CHARS)
    const [b, covered, a] = contextParts({
      context: `${before}sehr sehr${after}`,
      text: 'sehr sehr',
    })
    expect(covered).toBe('sehr sehr')
    expect(b).toBe('… Er gehen nach Hause. Das ist ein ')
    expect(a).toBe(' langer Satz mit Fehlern in der …')
  })
})
