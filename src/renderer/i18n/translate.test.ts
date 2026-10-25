import { describe, expect, it } from 'vitest'
import { detectLocale, messages, translate } from './translate'

describe('i18n messages', () => {
  it('German and English define exactly the same keys', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.de).sort())
  })
  it('every message has the same placeholders in both languages', () => {
    const placeholders = (text: string): string[] =>
      [...text.matchAll(/\{(\w+)(?:\}|\s*,\s*plural)/g)].map((m) => m[1]!).sort()
    for (const key of Object.keys(messages.de) as (keyof typeof messages.de)[]) {
      expect(placeholders(messages.en[key]), key).toEqual(placeholders(messages.de[key]))
    }
  })
})

describe('translate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'export.warn.unknown', { key: 'smith2020' })).toBe(
      'Citation without an entry in the bibliography: smith2020',
    )
    expect(translate('en', 'export.warn.unknown')).toBe(
      'Citation without an entry in the bibliography: {key}',
    )
  })
})

describe('plural forms', () => {
  it('say a count with its noun in the right form, in each language', () => {
    expect(translate('de', 'sidebar.sheetCount', { count: 1 })).toBe('1 Abschnitt')
    expect(translate('de', 'sidebar.sheetCount', { count: 0 })).toBe('0 Abschnitte')
    expect(translate('de', 'sidebar.sheetCount', { count: 7 })).toBe('7 Abschnitte')
    expect(translate('en', 'sidebar.sheetCount', { count: 1 })).toBe('1 sheet')
    expect(translate('en', 'sidebar.sheetCount', { count: 2 })).toBe('2 sheets')
  })
  it('take a formatted number as it is, and choose the form by the number in it', () => {
    expect(translate('de', 'statusbar.words', { count: '1.204' })).toBe('1.204 Wörter')
    expect(translate('de', 'statusbar.words', { count: '1' })).toBe('1 Wort')
    expect(translate('en', 'statusbar.words', { count: '1,204' })).toBe('1,204 words')
  })
  it('fill other placeholders around and inside the forms', () => {
    expect(translate('de', 'flow.summary', { sheets: 1, words: '2.300' })).toBe(
      '1 Abschnitt · 2.300 Wörter',
    )
    expect(translate('de', 'history.restoreAllMessage', { count: 1, when: 'gestern' })).toBe(
      '1 Datei wird auf den Stand vom gestern zurückgesetzt. Der aktuelle Stand wird vorher als Version gespeichert.',
    )
  })
  it('leaves a plural without its value visible, as a plain placeholder is', () => {
    expect(translate('en', 'sidebar.sheetCount')).toBe(
      '{count, plural, one {# sheet} other {# sheets}}',
    )
  })
  it('every plural message has a form for other', () => {
    for (const locale of ['de', 'en'] as const)
      for (const [key, text] of Object.entries(messages[locale]))
        if (/,\s*plural\s*,/.test(text)) expect(text, `${locale} ${key}`).toMatch(/other\s*\{/)
  })
})

describe('detectLocale', () => {
  it('prefers German when any preferred language is German', () => {
    expect(detectLocale(['en-US', 'de-AT'])).toBe('de')
    expect(detectLocale(['fr'])).toBe('en')
  })
})
