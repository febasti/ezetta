import type { EditorView } from '@codemirror/view'
import { citationAt, missingAt } from '@core/typst/citations'
import { citeField, missingField, openCite, openNewCite } from '../../editor/citeState'
import { quoteField } from '../../editor/quoteState'

/**
 * The Beleg command: opens the citation editor at the caret, empty, so the first work
 * chosen is inserted (in a block quote, into its source). Where the selection already is a citation or a marker, that one opens.
 */
export function chooseCitation(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const existing =
    citationAt(view.state.field(citeField), from, to) ??
    missingAt(view.state.field(missingField), from, to)
  if (existing) openCite(view, existing.from)
  else {
    // In a block quote the source goes to the quote's attribution, never into the quoted text.
    // (A note's editor has no quotes of its own: it is only text.)
    const quote = (view.state.field(quoteField, false) ?? []).find(
      (q) => q.block && !q.epigraph && from >= q.openTo && to <= q.closeFrom,
    )
    openNewCite(view, to, quote?.from)
  }
}
