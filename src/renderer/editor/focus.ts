import { Prec } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/**
 * Typewriter scrolling, which the writer switches on in the settings: the line being written stays
 * in the middle of the window, so the eyes do not follow the text down the screen. It follows
 * typing and the keys, not a click with the pointer.
 */
export interface FocusOptions {
  typewriter: boolean
}

/** Keeps the caret in the middle after typing or a key press, not after a click. */
const typewriter = EditorView.updateListener.of((update) => {
  if (!update.view.hasFocus) return
  const byKeys = update.transactions.some(
    (tr) =>
      tr.isUserEvent('input') ||
      tr.isUserEvent('delete') ||
      (tr.isUserEvent('select') && !tr.isUserEvent('select.pointer')),
  )
  if (!byKeys) return
  const { view } = update
  requestAnimationFrame(() => {
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }),
    })
  })
})

/** Room under the text, so that the last lines can reach the middle of the window too. */
const typewriterTheme = Prec.high(EditorView.theme({ '.cm-content': { paddingBottom: '50vh' } }))

export function focusExtension(options: FocusOptions): Extension {
  return [...(options.typewriter ? [typewriter, typewriterTheme] : [])]
}
