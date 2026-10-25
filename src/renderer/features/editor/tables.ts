import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { insertTable } from '@core/typst/edit'
import { tableField } from '../../editor/tableState'
import { focusTableCell } from '../../editor/tableWidget'

/**
 * Inserts an empty table (a header row and the rest) as a paragraph of its own, and puts the editing
 * in its first cell, so the header can be typed at once.
 */
export function insertTableCommand(view: EditorView, rows = 3, columns = 3): void {
  const { from, to } = view.state.selection.main
  const result = insertTable(
    { doc: view.state.doc.toString(), tree: syntaxTree(view.state), from, to },
    { rows, columns },
  )
  if (result.changes.length === 0) return
  view.dispatch({
    changes: result.changes,
    selection: { anchor: result.anchor },
    scrollIntoView: true,
    userEvent: 'input',
  })
  const created = view.state.field(tableField).findLast((table) => table.end <= result.anchor)
  if (created) focusTableCell(view, created.from, 0, 0)
}
