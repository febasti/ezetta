import type { EditorView } from '@codemirror/view'
import { i18n } from '../../i18n/i18n.svelte'
import type { MenuItem } from '../../lib/menu.svelte'
import { popupContextMenu } from '../../lib/menu.svelte'
import { setShowSource, ui } from '../../lib/ui.svelte'
import { proof } from '../proof/proof.svelte'
import { editorCommands, paragraphMenu, runEditorCommand } from './editorCommands'
import type { EditorCommandId } from './editorCommands'
import { editor } from './editorSession.svelte'
import { synonymDialog } from './thesaurus.svelte'
import { wordInContext } from './synonyms'
import type { WordInContext } from './synonyms'

/** A command of the editor as a menu item, with its shortcut. */
function command(view: EditorView, id: EditorCommandId, checked?: boolean): MenuItem {
  const found = editorCommands.find((c) => c.id === id)!
  return {
    label: found.label(),
    ...(found.shortcut ? { shortcut: found.shortcut } : {}),
    ...(checked !== undefined ? { checked } : {}),
    onselect: () => {
      view.focus()
      runEditorCommand(view, id)
    },
  }
}

/** The system's own cut, copy, paste, and select all; the app's own menu does them by hand. */
const clipboard = (
  view: EditorView | null,
  role: 'cut' | 'copy' | 'paste' | 'selectAll',
  label: string,
  disabled: boolean,
  fallback: () => void,
): MenuItem => ({
  label,
  role,
  disabled,
  onselect: () => {
    view?.focus()
    fallback()
  },
})

/** What a right click at `pos` offers: the issue under it first, then editing, format, and insert. */
export function editorMenuItems(
  view: EditorView,
  pos: number | null,
  word: WordInContext | null = null,
): MenuItem[] {
  const { empty } = view.state.selection.main
  const issue = pos === null ? undefined : editor.issues.find((i) => i.from <= pos && pos <= i.to)
  const items: MenuItem[] = []

  if (issue) {
    for (const value of issue.replacements.slice(0, 4))
      items.push({ label: value, onselect: () => editor.applyIssue(issue, value) })
    if (issue.replacements.length === 0) items.push({ label: issue.shortMessage, disabled: true })
    if (issue.category === 'spelling')
      items.push({
        label: i18n.t('proof.addToProject'),
        onselect: () => void proof.addWord('project', issue.text),
      })
    items.push(
      { label: i18n.t('proof.ignore'), onselect: () => proof.ignore(issue) },
      { separator: true },
    )
  }

  // Synonyms for the word open in a dialog, which looks them up (the first lookup starts the
  // helper, so the menu itself never waits).
  if (word)
    items.push(
      { label: i18n.t('thesaurus.menu'), onselect: () => synonymDialog.open(view, word) },
      { separator: true },
    )

  items.push(
    { ...command(view, 'undo'), disabled: !editor.canUndo },
    { ...command(view, 'redo'), disabled: !editor.canRedo },
    { separator: true },
    clipboard(view, 'cut', i18n.t('edit.cut'), empty, () => document.execCommand('cut')),
    clipboard(view, 'copy', i18n.t('edit.copy'), empty, () => document.execCommand('copy')),
    clipboard(view, 'paste', i18n.t('edit.paste'), false, () => document.execCommand('paste')),
    clipboard(view, 'selectAll', i18n.t('edit.selectAll'), false, () =>
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }),
    ),
    { separator: true },
    command(view, 'emphasis', editor.formats.emphasis),
    command(view, 'strong', editor.formats.strong),
    command(view, 'link'),
    { label: i18n.t('toolbar.paragraph'), submenu: paragraphMenu(view, editor.paragraph) },
    {
      label: i18n.t('toolbar.insert'),
      submenu: [
        command(view, 'footnote'),
        command(view, 'citation'),
        command(view, 'cross-reference'),
        command(view, 'figure'),
        command(view, 'inline-image'),
        command(view, 'table'),
        command(view, 'formula'),
        command(view, 'formula-display'),
        command(view, 'comment'),
      ],
    },
    { separator: true },
    {
      label: i18n.t('toolbar.source'),
      checked: ui.showSource,
      onselect: () => setShowSource(!ui.showSource),
    },
  )
  return items
}

/**
 * The context menu of the text, as the system's own. A right click outside the selection
 * puts the caret there first, so the menu is about what was clicked.
 */
export function openEditorContextMenu(view: EditorView, event: MouseEvent): void {
  event.preventDefault()
  // A field inside a widget (a table cell, a caption) is a text field: it gets the editing items only.
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
    const field = event.target
    const none = field.selectionStart === field.selectionEnd
    void popupContextMenu(
      event.clientX,
      event.clientY,
      [
        clipboard(null, 'cut', i18n.t('edit.cut'), none, () => document.execCommand('cut')),
        clipboard(null, 'copy', i18n.t('edit.copy'), none, () => document.execCommand('copy')),
        clipboard(null, 'paste', i18n.t('edit.paste'), false, () => document.execCommand('paste')),
        clipboard(null, 'selectAll', i18n.t('edit.selectAll'), false, () => field.select()),
      ],
      field,
    )
    return
  }
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const { from, to } = view.state.selection.main
  if (pos !== null && (pos < from || pos > to) && !view.state.readOnly)
    view.dispatch({ selection: { anchor: pos } })
  const context = pos === null || view.state.readOnly ? null : wordInContext(view, pos)
  void showMenu(view, event, pos, context)
}

async function showMenu(
  view: EditorView,
  event: MouseEvent,
  pos: number | null,
  word: WordInContext | null,
): Promise<void> {
  await popupContextMenu(
    event.clientX,
    event.clientY,
    editorMenuItems(view, pos, word),
    view.contentDOM,
  )
}
