import { showTooltip } from '@codemirror/view'
import type { EditorView, TooltipView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { createMathEditing } from '../../editor/mathField'
import { showSourceFacet } from '../../editor/markup'
import {
  activeFormula,
  activeMathField,
  isBlockWidget,
  mathConfig,
  mathField,
} from '../../editor/mathState'

/**
 * The popover of a formula that is drawn in the text: just the field with its source and the kind.
 * There is no preview in it, the formula in the text is the preview, and no button to remove it:
 * the formula is removed like any widget, with Backspace or Delete next to it. A block formula on
 * lines of its own has the same field inside its widget instead (`mathWidget.ts`).
 */
function createMathEditor(view: EditorView): TooltipView {
  const { labels } = view.state.facet(mathConfig)
  const dom = document.createElement('div')
  dom.className = 'cm-math-editor k-popover'
  dom.setAttribute('role', 'dialog')
  dom.setAttribute('aria-label', labels.editor)
  const editing = createMathEditing(view)
  dom.append(editing.dom)
  const sync = (): void => {
    const formula = activeFormula(view.state)
    if (formula) editing.sync(formula)
  }
  sync()
  return {
    dom,
    mount() {
      // A formula that was just inserted holds a starter: typing replaces it.
      editing.focus(view.state.field(activeMathField)?.select ?? false)
    },
    update(update) {
      if (update.docChanged || update.selectionSet) sync()
    },
  }
}

/** The popover, shown while a formula that is not a block of its own is open for editing. */
export const mathEditor: Extension = [
  activeMathField,
  showTooltip.compute([activeMathField, mathField, showSourceFacet], (state) => {
    const formula = activeFormula(state)
    if (!formula) return null
    // A block formula edits in its widget, unless Quelltext shows no widget at all.
    if (isBlockWidget(state.doc, formula) && !state.facet(showSourceFacet)) return null
    return { pos: formula.from, above: false, arrow: false, create: createMathEditor }
  }),
]
