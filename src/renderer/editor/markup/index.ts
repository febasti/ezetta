import { syntaxTree } from '@codemirror/language'
import { Prec, StateField } from '@codemirror/state'
import type { Extension, Facet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { atomicKeys } from '../atomicKeys'
import { activeCiteField, citeConfig, citeField, missingField } from '../citeState'
import { figureConfig, figureField } from '../figureState'
import { activeNoteField, footnoteConfig, footnoteField } from '../footnoteState'
import { activeMathField, mathConfig, mathField } from '../mathState'
import { armedQuoteField, quoteConfig, quoteField } from '../quoteState'
import { activeRefField, refConfig, refField } from '../refState'
import { searchField } from '../search'
import { tableConfig, tableField } from '../tableState'
import { build } from './build'
import type { Built } from './build'
import { labelsFacet, showSourceFacet } from './facets'
import type { MarkupLabels } from './facets'

export { labelsFacet, showSourceFacet }
export type { MarkupLabels }

/**
 * How simple Typst markup looks in the editor. Everything here is a decoration
 * over the plain source: nothing is stored in a hidden format, and the text is never changed.
 *
 * - Headings, emphasis, and strong keep their markers visible, dimmed. Only the text is styled.
 * - Subscript, superscript, and small caps hide their wrapper like the marks of an inline quote.
 * - Highlights and list markers hide their syntax and show the styled result. A link and a block
 *   quote hide their wrapper for good (atomic, never revealed by touch).
 * - Comments become small pills.
 * - Wherever the selection touches hidden syntax of those, the raw source is shown again. "Show
 *   source" turns all hiding off.
 * - An inline quote shows the quotation marks of the project's language in place of its syntax. The
 *   marks go only with the last of the quote's words, never by a press next to them (`atomicKeys.ts`).
 * - Citations are chips, and like footnote markers, images, and formulas they never reveal their
 *   source by touch. They are atomic: the caret jumps over them, and Backspace or Delete next to one
 *   first selects it, a second press deletes it (see `atomicKeys.ts`). Their source can only be
 *   edited with "Quelltext" on.
 * - Text the parser does not understand carries no decoration at all, so it is shown as written.
 *
 * The parts: `build.ts` walks the syntax tree and hands each node to the part that draws its kind:
 * `text.ts` (the simple markup), `chips.ts` (citations and cross-references), `quotes.ts`, and
 * `embeds.ts` (formulas, tables, images, footnotes). `builder.ts` collects what they draw, and
 * `layout.ts` decides from all of it what stays on one line and the space between lines.
 */

/** Every field `build` reads: a new value of one draws the text again. Keep in step with `build`. */
const FIELDS: readonly StateField<unknown>[] = [
  searchField,
  footnoteField,
  activeNoteField,
  figureField,
  mathField,
  activeMathField,
  quoteField,
  armedQuoteField,
  citeField,
  missingField,
  activeCiteField,
  tableField,
  refField,
  activeRefField,
]

/** Every facet `build` reads (a reconfiguration gives it a new value). */
const FACETS: readonly Facet<never, unknown>[] = [
  showSourceFacet,
  labelsFacet,
  footnoteConfig,
  figureConfig,
  mathConfig,
  quoteConfig,
  citeConfig,
  tableConfig,
  refConfig,
]

const decorations = StateField.define<Built>({
  create: (state) => build(state),
  update(value, tr) {
    const { state, startState } = tr
    const changed =
      tr.docChanged ||
      tr.selection ||
      syntaxTree(state) !== syntaxTree(startState) ||
      FIELDS.some((field) => state.field(field, false) !== startState.field(field, false)) ||
      FACETS.some((facet) => state.facet(facet) !== startState.facet(facet))
    return changed ? build(tr.state) : value
  },
  provide: (field) => [
    EditorView.decorations.from(field, (built) => built.decorations),
    // Lower precedence, so the marks wrap the widgets (and the images beside them).
    Prec.low(EditorView.decorations.from(field, (built) => built.together)),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
})

/** Styling for the classes above, from design tokens only. */
export const markupTheme = EditorView.theme({
  '.cm-marker': { color: 'var(--color-label-tertiary)', fontStyle: 'normal', fontWeight: '400' },
  // Syntax drawn as a widget or hidden stays on the line of the text it touches (`keepTogether`):
  // `pre` keeps the spaces as the line has them (`pre-wrap`), without the breaks.
  '.cm-together': { whiteSpace: 'pre' },
  '.cm-emphasis': { fontStyle: 'italic' },
  '.cm-strong': { fontWeight: '700' },
  '.cm-sub': { verticalAlign: 'sub', fontSize: '0.75em', lineHeight: '0' },
  '.cm-super': { verticalAlign: 'super', fontSize: '0.75em', lineHeight: '0' },
  '.cm-smallcaps': { fontVariantCaps: 'small-caps' },
  '.cm-line.cm-heading': { fontWeight: '600' },
  '.cm-line.cm-heading-1': { fontSize: '1.55em', lineHeight: '1.3', paddingTop: '0.6em' },
  '.cm-line.cm-heading-2': { fontSize: '1.3em', lineHeight: '1.35', paddingTop: '0.5em' },
  '.cm-line.cm-heading-3': { fontSize: '1.12em', lineHeight: '1.4', paddingTop: '0.4em' },
  '.cm-line.cm-heading-4, .cm-line.cm-heading-5, .cm-line.cm-heading-6': { fontStyle: 'italic' },
  '.cm-highlight': { backgroundColor: 'var(--color-mark)', borderRadius: 'var(--r-sm)' },
  '.cm-comment': { color: 'var(--color-label-tertiary)', fontStyle: 'italic' },
  '.cm-comment-pill': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-4)',
    padding: '0 var(--sp-4)',
    border: '1px dashed var(--color-field-border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--color-label-secondary)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.72em',
    lineHeight: '1.5',
    verticalAlign: 'baseline',
    cursor: 'text',
  },
  '.cm-link': { color: 'var(--color-accent)', textDecoration: 'underline' },
  '.cm-func': { color: 'var(--color-accent)' },
  '.cm-args': { color: 'var(--color-label-tertiary)' },
  '.cm-label, .cm-ref': { color: 'var(--color-accent)' },
  '.cm-math': { color: 'var(--color-label-secondary)' },
  '.cm-raw, .cm-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    color: 'var(--color-label-secondary)',
  },
  // A block quote has the faint ground of a quote in the text, so the two read as the same element,
  // and its rule.
  '.cm-line.cm-quote': {
    paddingLeft: 'var(--sp-16)',
    borderLeft: '3px solid var(--color-field-border)',
    backgroundColor: 'var(--color-quote)',
    color: 'var(--color-label-secondary)',
  },
  // The block quote the caret is in has its rule in the accent; one marked for removal (a press next
  // to its edge, see `atomicKeys.ts`) is on the selection's ground until the next press.
  '.cm-line.cm-quote.cm-quote-current': { borderLeftColor: 'var(--color-accent)' },
  '.cm-line.cm-quote-armed': { backgroundColor: 'var(--color-selection)' },
  // An epigraph (motto): set apart, right-aligned and italic, with no rule beside it.
  '.cm-line.cm-epigraph': {
    paddingLeft: 'calc(var(--sp-32) + var(--sp-16))',
    fontStyle: 'italic',
    color: 'var(--color-label-secondary)',
    textAlign: 'right',
  },
  '.cm-line.cm-list': { textIndent: 'calc(var(--sp-16) * -1)' },
  '.cm-line.cm-list-1': { paddingLeft: 'calc(var(--sp-16) * 2)' },
  '.cm-line.cm-list-2': { paddingLeft: 'calc(var(--sp-16) * 3)' },
  '.cm-line.cm-list-3': { paddingLeft: 'calc(var(--sp-16) * 4)' },
  '.cm-line.cm-list-4': { paddingLeft: 'calc(var(--sp-16) * 5)' },
  '.cm-line.cm-list-5': { paddingLeft: 'calc(var(--sp-16) * 6)' },
  '.cm-list-marker': {
    display: 'inline-block',
    width: 'var(--sp-16)',
    textIndent: '0',
    color: 'var(--color-label-tertiary)',
    textAlign: 'left',
  },
})

/** The extensions for rendering markup. Put them in a Compartment to change `showSource` later. */
export function markupExtension(options: { showSource: boolean; labels: MarkupLabels }): Extension {
  return [
    showSourceFacet.of(options.showSource),
    labelsFacet.of(options.labels),
    decorations,
    atomicKeys((state) => state.field(decorations, false)?.atomic),
    markupTheme,
  ]
}
