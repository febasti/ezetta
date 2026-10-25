import type { EditorView } from '@codemirror/view'
import { openNewRef, openRef, refField } from '../../editor/refState'

/**
 * The Querverweis command: opens the picker at the caret, so the target chosen is
 * inserted. Where the selection already is a reference, that one opens.
 */
export function chooseCrossReference(view: EditorView): void {
  const { from, to } = view.state.selection.main
  // A caret right after a chip is not on it; a selected chip is.
  const existing = view.state
    .field(refField)
    .refs.find((ref) => ref.from <= from && to <= ref.to && (from < ref.to || to > from))
  if (existing) openRef(view, existing.from)
  else openNewRef(view, to)
}
