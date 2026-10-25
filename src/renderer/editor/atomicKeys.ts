import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import type { Extension, RangeSet } from '@codemirror/state'
import { ViewPlugin, keymap } from '@codemirror/view'
import type { Command, Decoration, EditorView, ViewUpdate } from '@codemirror/view'
import { removeQuote, setAttribution } from '@core/typst/quotes'
import { armQuote, armedQuoteField, quoteField } from './quoteState'

/**
 * What Backspace and Delete select as one piece. Each atomic range of a widget carries the whole
 * thing it belongs to (an inline note has two ranges, its opening and its closing syntax).
 */
export interface AtomicUnit {
  from: number
  to: number
  /** A block widget has its own lines. */
  block: boolean
  /** For a format's wrapper (subscript, small caps, a link): Backspace or Delete next to it takes the format off (keeping its text) instead of selecting it. */
  unwrap?: readonly [readonly [number, number], readonly [number, number]]
  /**
   * For hidden syntax at the edge of a line (a block quote's wrapper): the caret just outside it
   * looks the same as just inside, so it is moved inside. `out` is where an arrow key leaving the
   * quote goes instead: the neighbouring line.
   */
  edge?: { outer: number; inner: number; out: number }
  /** For a quote: where it starts, so that its source can be found and taken away first. */
  quoteFrom?: number
  /**
   * For a quote (in the text or a block): its words. A press next to its marks marks the quote, and
   * the next one takes it off (`quoteKey`).
   */
  quote?: { content: { from: number; to: number } }
  /** Hidden syntax nobody can see selected (a heading's label): Backspace or Delete next to it does nothing. */
  silent?: boolean
}

/** The atomic ranges of a state, each carrying its unit in `spec.unit`. */
export type AtomicOf = (state: EditorState) => RangeSet<Decoration> | undefined

/** Where the caret at `head`, just outside a hidden wrapper at the edge of a line, belongs: inside it. */
function insideOf(atomic: RangeSet<Decoration> | undefined, head: number): number | null {
  let target: number | null = null
  atomic?.between(Math.max(0, head - 1), head + 1, (_from, _to, value) => {
    const edge = (value.spec.unit as AtomicUnit).edge
    if (!edge || edge.outer !== head) return
    target = edge.inner
    return false
  })
  return target
}

/**
 * Backspace or Delete next to a widget selects it (it is then drawn highlighted) instead of deleting
 * part of its syntax; the next press deletes the selection as usual. A block widget on its own
 * lines counts as next to the caret from the neighbouring line's edge too.
 */
function selectNeighbour(atomicOf: AtomicOf, forward: boolean): Command {
  return (view) => {
    const { state } = view
    const selection = state.selection
    if (selection.ranges.length !== 1 || !selection.main.empty) return false
    const pos = selection.main.head
    const line = state.doc.lineAt(pos)
    let found: AtomicUnit | null = null
    atomicOf(state)?.between(Math.max(0, pos - 1), pos + 1, (from, to, value) => {
      const unit = value.spec.unit as AtomicUnit
      const adjacent = forward
        ? from === pos || (unit.block && pos === line.to && from === pos + 1)
        : to === pos || (unit.block && pos === line.from && to === pos - 1)
      if (!adjacent) return
      found = unit
      return false
    })
    if (!found) return false
    const unit = found as AtomicUnit
    if (unit.silent) return true
    if (unit.quote) return quoteKey(view, unit)
    if (unit.unwrap) {
      // A format's wrapper (subscript, small caps, a link) is not selected: deleting next to it
      // takes the format off, keeping the text.
      view.dispatch({
        changes: unit.unwrap.map(([start, end]) => ({ from: start, to: end, insert: '' })),
        userEvent: 'delete',
      })
      return true
    }
    const { from, to } = unit
    view.dispatch({
      selection: EditorSelection.range(from, to),
      scrollIntoView: true,
      userEvent: 'select',
    })
    return true
  }
}

/**
 * Backspace or Delete next to a quotation mark (or a block quote's hidden wrapper), from outside or
 * from inside. The marks read as characters, so a press next to one should take it, but never two
 * marks far apart by accident:
 *
 * - The first press marks the quote: it is drawn on the selection's ground, and nothing changes.
 * - The second press takes the quote off and keeps its text (`removeQuote`); undo brings it back.
 * - In an empty quote the first press already removes it (a block quote's source first).
 */
function quoteKey(view: EditorView, unit: AtomicUnit): boolean {
  const { state } = view
  const quote =
    unit.quoteFrom === undefined
      ? undefined
      : state.field(quoteField, false)?.find((q) => q.from === unit.quoteFrom)
  if (!quote) return true
  const { content } = unit.quote!
  if (state.sliceDoc(content.from, content.to).trim() === '') {
    const dropSource = quote.attribution ? setAttribution(state.doc.toString(), quote, null) : null
    view.dispatch(
      dropSource
        ? { changes: dropSource, userEvent: 'delete' }
        : {
            changes: { from: unit.from, to: unit.to, insert: '' },
            selection: EditorSelection.cursor(unit.from),
            userEvent: 'delete',
          },
    )
    return true
  }
  if (state.field(armedQuoteField, false) !== quote.from) {
    view.dispatch({ effects: armQuote.of(quote.from) })
    return true
  }
  view.dispatch({
    changes: removeQuote(state.doc.toString(), quote),
    scrollIntoView: true,
    userEvent: 'delete',
  })
  return true
}

/**
 * The caret at the edge of a block quote's hidden wrapper is moved inside it: just outside and just
 * inside look the same, and text typed outside would leave the quote. (The arrow keys that leave
 * the quote are `leaveQuote`.)
 */
const keepCaretInside = (atomicOf: AtomicOf): Extension =>
  EditorState.transactionFilter.of((tr) => {
    const selection = tr.selection
    if (!selection || tr.docChanged || selection.ranges.length !== 1 || !selection.main.empty)
      return tr
    const head = selection.main.head
    const target = insideOf(atomicOf(tr.startState), head)
    if (target === null || target === head) return tr
    return [tr, { selection: EditorSelection.cursor(target) }]
  })

/**
 * The same after an edit: joining the line above to a block quote (Delete on a blank line), undo, or
 * opening a sheet that starts with one can leave the caret just outside the wrapper, where text
 * typed would not be in the quote. The caret is moved in once the update is done.
 */
const keepCaretInsideAfterEdit = (atomicOf: AtomicOf): Extension =>
  ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate): void {
        if (!update.docChanged) return
        const { selection } = update.state
        if (selection.ranges.length !== 1 || !selection.main.empty) return
        const head = selection.main.head
        const to = insideOf(atomicOf(update.state), head)
        if (to === null || to === head) return
        const { view } = update
        // A dispatch is not allowed while the update is running; a microtask is before the next paint.
        queueMicrotask(() => {
          if (view.dom.isConnected && view.state.selection.main.head === head)
            view.dispatch({ selection: EditorSelection.cursor(to) })
        })
      }
    },
  )

/**
 * An arrow key at the inner edge of a block quote's hidden wrapper goes on to the neighbouring line
 * instead of stopping for a step nobody can see.
 */
function leaveQuote(atomicOf: AtomicOf, forward: boolean): Command {
  return (view) => {
    const { state } = view
    const { main } = state.selection
    if (state.selection.ranges.length !== 1 || !main.empty) return false
    let target: number | null = null
    atomicOf(state)?.between(main.head - 1, main.head + 1, (from, to, value) => {
      const edge = (value.spec.unit as AtomicUnit).edge
      if (!edge || edge.inner !== main.head || (forward ? from !== main.head : to !== main.head))
        return
      target = edge.out
      return false
    })
    if (target === null || target === main.head) return false
    view.dispatch({
      selection: EditorSelection.cursor(target),
      scrollIntoView: true,
      userEvent: 'select',
    })
    return true
  }
}

/**
 * Enter at the end of a heading's text, in front of its hidden label, breaks the line after the
 * label: the label stays with its heading.
 */
const breakAfterLabel =
  (atomicOf: AtomicOf): Command =>
  (view) => {
    const { state } = view
    const { main } = state.selection
    if (state.selection.ranges.length !== 1 || !main.empty) return false
    let end: number | null = null
    atomicOf(state)?.between(main.head, main.head + 1, (from, to, value) => {
      const unit = value.spec.unit as AtomicUnit
      if (!unit.silent || !unit.edge || from !== main.head) return
      end = to
      return false
    })
    if (end === null) return false
    view.dispatch({
      changes: { from: end, to: end, insert: '\n' },
      selection: EditorSelection.cursor((end as number) + 1),
      scrollIntoView: true,
      userEvent: 'input',
    })
    return true
  }

/**
 * The caret and the keys around atomic units: Backspace and Delete select a unit first, arrow keys
 * leave a block quote's hidden wrapper, Enter keeps a heading's hidden label with its heading, and
 * the caret never rests just outside a wrapper. `atomicOf` gives the units of a state.
 */
export function atomicKeys(atomicOf: AtomicOf): Extension {
  return [
    armedQuoteField,
    keepCaretInside(atomicOf),
    keepCaretInsideAfterEdit(atomicOf),
    Prec.high(
      keymap.of([
        { key: 'Enter', run: breakAfterLabel(atomicOf) },
        { key: 'ArrowLeft', run: leaveQuote(atomicOf, false) },
        { key: 'ArrowRight', run: leaveQuote(atomicOf, true) },
        { key: 'Backspace', run: selectNeighbour(atomicOf, false) },
        { key: 'Delete', run: selectNeighbour(atomicOf, true) },
      ]),
    ),
  ]
}
