import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { figureField } from './figureState'
import { markupExtension } from './markup'
import { mathField } from './mathState'
import { quoteField } from './quoteState'
import { typstLanguage } from './typst'

/** The decorations over the text: the lines with a `//` comment, and the widgets that hide text. */
function draw(doc: string, anchor: number): { lines: number[]; replaced: number } {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      typstLanguage,
      figureField,
      mathField,
      quoteField,
      markupExtension({ showSource: false, labels: { comment: (text) => text } }),
    ],
  })
  const lines: number[] = []
  let replaced = 0
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue
    ;(source as DecorationSet).between(0, doc.length, (from, to, value: Decoration) => {
      const spec = value.spec as { class?: string; widget?: unknown }
      if (spec.class?.split(' ').includes('cm-comment-line'))
        lines.push(state.doc.lineAt(from).number)
      if (spec.widget && to > from) replaced += 1
    })
  }
  return { lines, replaced }
}

describe('a // comment', () => {
  it('gives its whole line a ground and hides nothing', () => {
    const doc = 'Eins.\n// Ein Hinweis\nDrei.'
    expect(draw(doc, doc.length)).toEqual({ lines: [2], replaced: 0 })
  })

  it('stays as written when the caret is elsewhere or inside it', () => {
    const doc = 'Text // Hinweis\nMehr.'
    expect(draw(doc, 0)).toEqual({ lines: [1], replaced: 0 })
    expect(draw(doc, 10)).toEqual({ lines: [1], replaced: 0 })
  })

  it('leaves the pill of a block comment alone', () => {
    const doc = 'Text /* Hinweis */ mehr.\nEnde.'
    expect(draw(doc, doc.length)).toEqual({ lines: [], replaced: 1 })
  })
})
