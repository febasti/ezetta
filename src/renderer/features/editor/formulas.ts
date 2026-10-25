import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { insertFormula } from '@core/typst/edit'
import { formulaAt } from '@core/typst/math'
import { mathField, openMath } from '../../editor/mathState'

/**
 * Inserts a formula at the caret and opens it for editing, with its starter text
 * selected. Where the selection already is a formula, it opens that one instead.
 */
export function insertFormulaCommand(view: EditorView, display: boolean): void {
  const { from, to } = view.state.selection.main
  const existing = formulaAt(view.state.field(mathField), from, to)
  if (existing) return openMath(view, existing.from)
  const result = insertFormula(
    { doc: view.state.doc.toString(), tree: syntaxTree(view.state), from, to },
    { display },
  )
  if (result.changes.length === 0) return undefined
  view.dispatch({
    changes: result.changes,
    selection: { anchor: result.anchor },
    scrollIntoView: true,
    userEvent: 'input',
  })
  const created = view.state.field(mathField).find((formula) => formula.end === result.anchor)
  if (created) openMath(view, created.from, true)
  return undefined
}
