import { syntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import type { Transaction } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { gapAt } from '@core/typst/paragraphs'

/**
 * The caret never rests on the empty line between two paragraphs (`gapAt` in
 * `core/typst/paragraphs.ts`), as in a word processor: a move that would end there goes on to the
 * paragraph in its direction, and a click there puts the caret at the end of the paragraph above.
 * Up and Down move once more themselves (`overGaps`), so the caret keeps its column.
 */

/** Set while Up or Down moves the caret twice: the filter leaves those moves alone. */
let vertical = false

/** Where the head of `tr` lands on a gap: the end it goes to instead, or null. */
function gapTarget(tr: Transaction): number | null {
  const head = tr.newSelection.main.head
  const { doc } = tr.startState
  const line = doc.lineAt(head)
  // Only an empty line inside the text can be one: the whole text is read for nothing else.
  if (line.text.trim() !== '' || line.number === 1 || line.number === doc.lines) return null
  const gap = gapAt({ doc: doc.toString(), tree: syntaxTree(tr.startState) }, head)
  if (!gap) return null
  const backward = tr.isUserEvent('select.pointer') || head < tr.startState.selection.main.head
  return backward ? gap.before : gap.after
}

/**
 * Low precedence: filters of lower precedence run first, so the markup's own filter (the caret
 * never rests just outside a block quote's hidden wrapper) sees where this one put the caret.
 */
export const skipGaps = Prec.low(
  EditorState.transactionFilter.of((tr) => {
    if (vertical || tr.docChanged || !tr.selection || tr.newSelection.ranges.length !== 1) return tr
    if (!tr.isUserEvent('select') || tr.isUserEvent('select.search')) return tr
    const target = gapTarget(tr)
    if (target === null) return tr
    const main = tr.newSelection.main
    const range = main.empty
      ? EditorSelection.cursor(target)
      : EditorSelection.range(main.anchor, target)
    return [tr, { selection: EditorSelection.create([range]), sequential: true }]
  }),
)

/** Up or Down: when the move ends on a gap, the same move once more, so the column is kept. */
export const overGaps =
  (move: Command): Command =>
  (view) => {
    vertical = true
    try {
      if (!move(view)) return false
      const { state } = view
      const { main } = state.selection
      const line = state.doc.lineAt(main.head)
      if (line.text.trim() === '' && line.number > 1 && line.number < state.doc.lines) {
        const gap = gapAt({ doc: state.doc.toString(), tree: syntaxTree(state) }, main.head)
        if (gap) move(view)
      }
      return true
    } finally {
      vertical = false
    }
  }
