import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { quoteMarks, scanQuotes } from '@core/typst/quotes'
import type { Quote, QuoteMarks } from '@core/typst/quotes'
import { fullTree, sourceText } from './source'

export interface QuoteConfig {
  /** The quotation marks of the project's language. The file holds none of its own. */
  marks: QuoteMarks
  /** From this many words an inline quote offers to become a block quote. */
  blockFromWords: number
  /** Block quotes get quotation marks too: a project setting, with marks from the same language. */
  blockMarks: boolean
  labels: {
    /** The hint button's text, with the number of words. */
    hint: (words: number) => string
    mark: (which: 'open' | 'close') => string
    /** The button that adds a source (a citation) to a block quote that has none. */
    addSource: string
    /** The field for the source of an epigraph: its name for screen readers and its placeholder. */
    source: string
    sourceInvalid: string
  }
}

const DEFAULT_CONFIG: QuoteConfig = {
  marks: quoteMarks('de'),
  blockFromWords: 40,
  blockMarks: false,
  labels: {
    hint: (words) => String(words),
    mark: () => '',
    addSource: '',
    source: '',
    sourceInvalid: '',
  },
}

export const quoteConfig = Facet.define<Partial<QuoteConfig>, QuoteConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as QuoteConfig,
})

function compute(state: EditorState): readonly Quote[] {
  const tree = fullTree(state)
  return scanQuotes(tree, sourceText(state), {
    blockMarks: state.facet(quoteConfig).blockMarks,
  })
}

/** The quotes of the document, rebuilt when the text or the syntax changes. */
export const quoteField = StateField.define<readonly Quote[]>({
  create: (state) => compute(state),
  update: (value, tr) =>
    tr.docChanged ||
    syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
    tr.state.facet(quoteConfig) !== tr.startState.facet(quoteConfig)
      ? compute(tr.state)
      : value,
})

/** Marks the quote that starts at the position for removal (the first press next to its marks). */
export const armQuote = StateEffect.define<number>()

/**
 * The quote whose marks were pressed once, by where it starts: it is drawn on the selection's
 * ground, and the next Backspace or Delete next to its marks takes it off, keeping its text. Any
 * other edit or move of the caret lets it go again.
 */
export const armedQuoteField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(armQuote)) return effect.value
    return tr.docChanged || tr.selection ? null : value
  },
})

/** The block quote whose closing bracket is at `pos`: where the chips of its source are drawn. */
export function quoteClosingAt(state: EditorState, pos: number): Quote | undefined {
  return state.field(quoteField).find((q) => q.block && !q.epigraph && q.to === pos)
}

/** The epigraph that ends on the line that ends at `pos`: where the field of its source is drawn. */
export function epigraphEndingAt(state: EditorState, pos: number): Quote | undefined {
  return state.field(quoteField).find((q) => q.epigraph && state.doc.lineAt(q.end).to === pos)
}
