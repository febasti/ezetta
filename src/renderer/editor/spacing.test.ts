import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { figureField } from './figureState'
import { markupExtension } from './markup'
import { mathField } from './mathState'
import { quoteField } from './quoteState'
import { typstLanguage } from './typst'

/** The spacing classes of each line, as CodeMirror would draw them. */
function spacing(doc: string): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [
      typstLanguage,
      figureField,
      mathField,
      quoteField,
      markupExtension({ showSource: false, labels: { comment: (text) => text } }),
    ],
  })
  const lines = Array.from({ length: state.doc.lines }, () => new Set<string>())
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue
    ;(source as DecorationSet).between(0, doc.length, (from, _to, value: Decoration) => {
      const className = (value.spec as { class?: string }).class
      if (from !== _to || !className) return
      for (const name of className.split(' '))
        if (['cm-blank', 'cm-spaced', 'cm-before-quote'].includes(name))
          lines[state.doc.lineAt(from).number - 1]!.add(name)
    })
  }
  return lines.map((set) => [...set].sort().join(' '))
}

describe('the space between lines', () => {
  it('sets off a line that follows another, and makes a blank line the gap', () => {
    expect(spacing('Eins.\nZwei.\n\nDrei.')).toEqual(['', 'cm-spaced', 'cm-blank', ''])
  })

  it('spaces a heading that follows a line', () => {
    expect(spacing('Text.\n== Titel\nMehr.')).toEqual(['', 'cm-spaced', 'cm-spaced'])
  })

  it('gives the gap before a block quote to the line above it', () => {
    expect(spacing('Text.\n#quote(block: true)[Zitat.]\nWeiter.')).toEqual([
      'cm-before-quote',
      '',
      'cm-spaced',
    ])
  })

  it('spaces the lines inside a block quote from each other', () => {
    expect(spacing('\n#quote(block: true)[Eins.\nZwei.]')).toEqual(['cm-blank', '', 'cm-spaced'])
  })

  it('does not space a line from a block widget above it', () => {
    const doc =
      'Text.\n#figure(\n  rect(width: 100%, height: 6cm),\n  caption: [],\n) <fig-a>\nNach.'
    expect(spacing(doc)).toEqual(['', '', '', '', '', ''])
  })

  it('does not depend on which lines are drawn', () => {
    // The same text gives the same classes, however far it runs: nothing here looks at the DOM.
    const paragraph = 'Ein Absatz mit genug Text, damit er umbricht. '.repeat(8)
    const doc = Array.from({ length: 200 }, () => paragraph).join('\n')
    const classes = spacing(doc)
    expect(classes[0]).toBe('')
    expect(new Set(classes.slice(1))).toEqual(new Set(['cm-spaced']))
  })
})
