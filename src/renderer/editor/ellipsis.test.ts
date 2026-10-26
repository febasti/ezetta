import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { figureField } from './figureState'
import { markupExtension } from './markup'
import { Ellipsis } from './markup/widgets'
import { mathField } from './mathState'
import { quoteField } from './quoteState'
import { typstLanguage } from './typst'

/** The text with each drawn ellipsis in `[]`; the caret is where `|` stands in `doc` (else at the start). */
function drawn(doc: string, options: { showSource?: boolean } = {}): string {
  const caret = doc.indexOf('|')
  const text = doc.replace('|', '')
  const state = EditorState.create({
    doc: text,
    selection: { anchor: Math.max(caret, 0) },
    extensions: [
      typstLanguage,
      figureField,
      mathField,
      quoteField,
      markupExtension({
        showSource: options.showSource ?? false,
        labels: { comment: (note) => note },
      }),
    ],
  })
  const found: number[] = []
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue
    ;(source as DecorationSet).between(0, text.length, (from, to, value: Decoration) => {
      if ((value.spec as { widget?: unknown }).widget instanceof Ellipsis && to - from === 3)
        found.push(from)
    })
  }
  let result = text
  for (const from of found.sort((a, b) => b - a))
    result = `${result.slice(0, from)}[…]${result.slice(from + 3)}`
  return result
}

describe('the ellipsis', () => {
  it('draws three dots in the words as one ellipsis', () => {
    expect(drawn('Warte... dann')).toBe('Warte[…] dann')
    expect(drawn('Eins...\nZwei... Drei.')).toBe('Eins[…]\nZwei[…] Drei.')
  })

  it('reads every three dots as one, as Typst does', () => {
    expect(drawn('Zwei.. nicht')).toBe('Zwei.. nicht')
    expect(drawn('Vier.... dann')).toBe('Vier[…]. dann')
    expect(drawn('Sechs...... dann')).toBe('Sechs[…][…] dann')
  })

  it('shows the dots while the caret touches them', () => {
    expect(drawn('Warte...| dann')).toBe('Warte... dann')
    expect(drawn('Warte|... dann')).toBe('Warte... dann')
    expect(drawn('Warte... dann|')).toBe('Warte[…] dann')
  })

  it('draws the dots in a function’s words, a highlight and a heading', () => {
    expect(drawn('#emph[Warte...]')).toBe('#emph[Warte[…]]')
    expect(drawn('::Warte...::')).toBe('::Warte[…]::')
    expect(drawn('= Und so weiter...')).toBe('= Und so weiter[…]')
  })

  it('leaves the dots where they are not prose', () => {
    expect(drawn('`a...b`')).toBe('`a...b`')
    expect(drawn('$a...b$')).toBe('$a...b$')
    expect(drawn('Siehe https://example.org/a...b hier')).toBe(
      'Siehe https://example.org/a...b hier',
    )
    expect(drawn('/* Warte... */ Text')).toBe('/* Warte... */ Text')
    expect(drawn('#cite(<a>, supplement: "S. 1...2")')).toBe('#cite(<a>, supplement: "S. 1...2")')
    expect(drawn('\\... Text')).toBe('\\... Text')
  })

  it('draws no ellipsis when the source is shown', () => {
    expect(drawn('Warte... dann', { showSource: true })).toBe('Warte... dann')
  })
})
