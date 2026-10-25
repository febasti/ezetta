import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { footnoteField } from './footnoteState'
import { markupExtension } from './markup'
import { quoteField } from './quoteState'
import { typstLanguage } from './typst'

/** The pieces of text kept on one line, as source. */
function together(doc: string): string[] {
  const state = EditorState.create({
    doc,
    extensions: [
      typstLanguage,
      footnoteField,
      quoteField,
      markupExtension({ showSource: false, labels: { comment: (text) => text } }),
    ],
  })
  const out: string[] = []
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue
    ;(source as DecorationSet).between(0, doc.length, (from, to, value: Decoration) => {
      if ((value.spec as { class?: string }).class === 'cm-together') out.push(doc.slice(from, to))
    })
  }
  return out
}

describe('syntax drawn as a widget stays with the text it touches', () => {
  it('keeps the marks of a quote with its first and last letter, not with the spaces outside', () => {
    expect(together('Er sagte #quote[Hallo] dort.')).toEqual(['#quote[H', 'o]'])
    expect(together('Er sagte (#quote[Hallo]).')).toEqual(['(#quote[H', 'o])'])
  })

  it('keeps a footnote marker with the word before it', () => {
    expect(together('Ein Wort#footnote[Text] weiter.')).toEqual(['t#footnote[Text]'])
  })

  it('keeps a word whole that has hidden syntax inside it', () => {
    expect(together('Wasser ist H#sub[2]O.')).toEqual(['H#sub[2]O'])
  })

  it('leaves hidden syntax with a space beside it alone, so a highlight stays in one piece', () => {
    expect(together('Ein ::markiertes Wort:: hier.')).toEqual([])
  })
})
