import { describe, expect, it } from 'vitest'
import { parseTypst } from '../typst/parser'
import { sampleSheet, sampleTitle } from './sample'

describe('the sample sheet of a thumbnail', () => {
  it('has a chapter, a section with a footnote and a list, in each language', () => {
    for (const language of ['de', 'en'] as const) {
      const text = sampleSheet(language)
      expect(text).toMatch(/^= \S+\n/)
      expect(text).toContain('\n== ')
      expect(text).toContain('#footnote[')
      expect(text.match(/^- /gm)).toHaveLength(2)
      expect(parseTypst(text)).toBeTruthy()
    }
  })
  it('speaks the language of the app', () => {
    expect(sampleSheet('de')).toContain('= Kapitel')
    expect(sampleSheet('en')).toContain('= Chapter')
    expect(sampleTitle('en')).not.toBe(sampleTitle('de'))
  })
})
