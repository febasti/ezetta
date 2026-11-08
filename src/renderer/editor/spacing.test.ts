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
function spacing(doc: string, showSource = false): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [
      typstLanguage,
      figureField,
      mathField,
      quoteField,
      markupExtension({ showSource, labels: { comment: (text) => text } }),
    ],
  })
  const lines = Array.from({ length: state.doc.lines }, () => new Set<string>())
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue
    ;(source as DecorationSet).between(0, doc.length, (from, _to, value: Decoration) => {
      const className = (value.spec as { class?: string }).class
      if (from !== _to || !className) return
      for (const name of className.split(' '))
        if (['cm-blank', 'cm-gap', 'cm-spaced', 'cm-before-quote'].includes(name))
          lines[state.doc.lineAt(from).number - 1]!.add(name)
    })
  }
  return lines.map((set) => [...set].sort().join(' '))
}

describe('the space between lines', () => {
  it('sets a line that follows another with a single line break close to it: one paragraph', () => {
    expect(spacing('Eins.\nZwei.')).toEqual(['', ''])
    expect(spacing('Eins. \\\nZwei.')).toEqual(['', ''])
  })

  it('draws no gap with Quelltext on: an empty line is a line like any other', () => {
    expect(spacing('Eins.\n\nDrei.', true)).toEqual(['', '', ''])
  })

  it('makes the empty line after a paragraph the gap to the next', () => {
    expect(spacing('Eins.\n\nDrei.')).toEqual(['', 'cm-gap', ''])
    expect(spacing('== Titel\n')).toEqual(['', 'cm-gap'])
  })

  it('draws a further empty line as a line, so nothing moves when it is typed into', () => {
    expect(spacing('Eins.\n\n\nVier.')).toEqual(['', 'cm-gap', '', ''])
    expect(spacing('Eins.\n\n\n')).toEqual(['', 'cm-gap', '', ''])
    expect(spacing('Eins.\n\nX')).toEqual(['', 'cm-gap', ''])
    expect(spacing('\nText.')).toEqual(['', ''])
  })

  it('sets off list items and the lines next to them, which are paragraphs of their own', () => {
    expect(spacing('Text.\n- eins\n- zwei\nMehr.')).toEqual([
      '',
      'cm-spaced',
      'cm-spaced',
      'cm-spaced',
    ])
    expect(spacing('Text.\n\n- eins')).toEqual(['', 'cm-gap', ''])
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

  it('sets the lines of one paragraph in a block quote close, and the text after it off', () => {
    expect(spacing('Text.\n#quote(block: true)[Eins.\nZwei.]\nDanach.')).toEqual([
      'cm-before-quote',
      '',
      '',
      'cm-spaced',
    ])
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
    expect(new Set(classes.slice(1))).toEqual(new Set(['']))
    const paragraphs = spacing(Array.from({ length: 200 }, () => paragraph).join('\n\n'))
    expect(new Set(paragraphs.filter((_, i) => i % 2 === 1))).toEqual(new Set(['cm-gap']))
    expect(new Set(paragraphs.filter((_, i) => i % 2 === 0))).toEqual(new Set(['']))
  })
})
