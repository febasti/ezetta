import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { insideOpaque } from '@core/typst/edit'
import { typeOnGap } from '@core/typst/paragraphs'
import { pastedText } from '@core/typst/paste'

/**
 * Text pasted into the sheet, as paragraphs Typst reads the same way (`core/typst/paste.ts`): from
 * another program its paragraphs come behind empty lines, its other line breaks become spaces, and
 * what would be markup is escaped; what was copied in the editor itself is pasted as it is. Pasted
 * on the empty last line of a sheet, the text starts a paragraph of its own, as typed text does. In
 * code, math, raw text and comments, and in the fields of widgets, the editor pastes as it always
 * does.
 */

/** The text the editor last put on the clipboard, to know it again when it is pasted. */
let ownCopy: string | null = null

/** What CodeMirror copies: the selected text, or with only a caret the whole lines. */
function copiedText(state: EditorState): string {
  const { ranges } = state.selection
  if (ranges.every((r) => r.empty))
    return ranges.map((r) => state.doc.lineAt(r.head).text).join(state.lineBreak)
  return ranges
    .filter((r) => !r.empty)
    .map((r) => state.sliceDoc(r.from, r.to))
    .join(state.lineBreak)
}

const sameText = (a: string, b: string): boolean =>
  a.replace(/\r\n?/g, '\n').replace(/\n+$/, '') === b.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

export const rememberCopies = EditorView.domEventHandlers({
  copy: (_event, view) => {
    ownCopy = copiedText(view.state)
    return false
  },
  cut: (_event, view) => {
    ownCopy = copiedText(view.state)
    return false
  },
})

/** Handles a paste of text; false leaves it to the editor. */
export function pasteText(event: ClipboardEvent, view: EditorView): boolean {
  const data = event.clipboardData
  if (!data) return false
  if (event.target instanceof Element && event.target.closest('textarea, input')) return false
  const { state } = view
  if (state.selection.ranges.length !== 1) return false
  const { from, to } = state.selection.main
  const tree = syntaxTree(state)
  if (insideOpaque(tree, from) || insideOpaque(tree, to)) return false
  const plain = data.getData('text/plain')
  const own = ownCopy !== null && sameText(plain, ownCopy)
  const html = data.types.includes('text/html') ? data.getData('text/html') : null
  const lineStart = state.doc.lineAt(from).from
  const atLineStart = state.sliceDoc(lineStart, from).trim() === ''
  const paragraphs = own ? null : pastedText(plain, html, atLineStart)
  const text = paragraphs ?? plain
  if (text === '') return false
  // On the empty last line of a sheet the text would join the paragraph above.
  const onGap =
    from === to && state.doc.lineAt(from).length === 0
      ? typeOnGap({ doc: state.doc.toString(), tree, from, to }, text)
      : null
  if (!onGap && paragraphs === null) return false
  event.preventDefault()
  view.dispatch({
    changes: onGap ? onGap.changes : [{ from, to, insert: text }],
    selection: { anchor: onGap ? onGap.anchor : from + text.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  })
  return true
}
