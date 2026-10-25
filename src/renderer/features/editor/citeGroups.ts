import { Annotation } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { ViewPlugin } from '@codemirror/view'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { citationGroups, unifyGroup } from '@core/typst/citations'
import type { TextEdit } from '@core/typst/figures'
import { citeField } from '../../editor/citeState'

/**
 * Citations that touch (only white space between) are one group in the PDF, and a group with
 * different forms prints something broken. So the editor keeps the forms of a group equal: a
 * citation typed or pasted next to others takes the group's form (see `groupForm`).
 *
 * It waits until the caret has left the group (or the editor lost the focus), because converting
 * `@j` into `#cite(<j>, form: "prose")` while its key is still being typed would get in the way. It
 * only touches groups that were edited, never others in the sheet, and not after undo or redo (so
 * undo cannot loop). The conversion is its own undo step.
 */
const fromUnify = Annotation.define<boolean>()

class Unifier {
  /** Where text changed since the last time groups were settled, in the current coordinates. */
  private touched: { from: number; to: number }[] = []

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.touched = this.touched.map((range) => ({
        from: update.changes.mapPos(range.from, -1),
        to: update.changes.mapPos(range.to, 1),
      }))
      const skip = update.transactions.some(
        (tr) => tr.annotation(fromUnify) || tr.isUserEvent('undo') || tr.isUserEvent('redo'),
      )
      if (!skip)
        update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) =>
          this.touched.push({ from: fromB, to: toB }),
        )
    }
    if (this.touched.length === 0) return
    if (!update.docChanged && !update.selectionSet && !update.focusChanged) return
    const { view, state } = update
    // After this update is finished; and not if the text has moved on since (the next update settles).
    queueMicrotask(() => {
      if (view.state === state) this.settle(view)
    })
  }

  private settle(view: EditorView): void {
    const { state } = view
    if (state.readOnly) return
    const doc = state.doc.toString()
    const groups = citationGroups(state.field(citeField), doc)
    const caret = state.selection.main
    const keep: { from: number; to: number }[] = []
    const edits = new Map<number, TextEdit>()
    for (const range of this.touched) {
      const group = groups.find(
        (g) => g[0]!.from <= range.to + 1 && g[g.length - 1]!.end >= range.from - 1,
      )
      if (!group) continue
      const fixes = unifyGroup(doc, group)
      if (fixes.length === 0) continue // equal already
      const inside = caret.from <= group[group.length - 1]!.end && caret.to >= group[0]!.from
      if (inside && view.hasFocus)
        keep.push(range) // still typing here
      else for (const fix of fixes) edits.set(fix.from, fix)
    }
    this.touched = keep
    if (edits.size > 0)
      view.dispatch({
        changes: [...edits.values()],
        annotations: fromUnify.of(true),
        userEvent: 'input.format',
      })
  }
}

export const unifyCitationGroups: Extension = ViewPlugin.fromClass(Unifier)
