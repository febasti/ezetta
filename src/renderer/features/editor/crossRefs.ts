import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { analyzeSheet } from '@core/typst/text'
import { parseTypst } from '@core/typst/parser'
import { labelEdit, labelsIn, newLabel, scanTargets, supplementsFor } from '@core/typst/targets'
import type { NumberedTarget } from '@core/typst/targets'
import type { RefConfig } from '../../editor/refState'
import { i18n } from '../../i18n/i18n.svelte'
import { call } from '../../lib/api'
import { headingNumbering } from '../export/numbering.svelte'
import { project } from '../sidebar/project.svelte'
import { editor } from './editorSession.svelte'

/**
 * Gives a target in another sheet its label by changing that sheet's file, and returns the label.
 * The sheet is read again first: the target must still be where the statistics said, still without
 * a label. Null if it is not, or if the file could not be written.
 */
export async function labelInOtherSheet(
  target: NumberedTarget,
  taken: ReadonlySet<string>,
): Promise<string | null> {
  const read = await call(window.api.project.readSheet({ path: target.path }))
  if (!read) return null
  const text = read.content
  const here = scanTargets(parseTypst(text), text).find(
    (t) => t.kind === target.kind && t.at === target.at && t.label === null,
  )
  if (!here) return null
  const label = newLabel(here.kind, here.title, new Set([...taken, ...labelsIn(text)]))
  const edit = labelEdit(here, label)
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  const written = await call(window.api.project.writeSheet({ path: target.path, content: next }))
  if (!written) return null
  // The watcher reports the change in a moment; the chip should not wait for it.
  project.noteTargets(target.path, analyzeSheet(next).targets)
  return label
}

/** Goes to a target: in this sheet by moving the caret there, in another by opening the sheet. */
export function goToTarget(view: EditorView, path: string, at: number): void {
  if (path === editor.path) {
    view.dispatch({
      selection: EditorSelection.cursor(Math.min(at, view.state.doc.length)),
      effects: EditorView.scrollIntoView(at, { y: 'center' }),
      userEvent: 'select',
    })
    view.focus()
  } else void project.openSheet(path, at)
}

/** The configuration of the cross-reference chips: the project's targets, in the language of the text. */
export function crossRefSettings(options: { livePath: string | null }): Partial<RefConfig> {
  return {
    sheets: project.targetSheets,
    livePath: options.livePath,
    supplements: {
      ...supplementsFor(project.snapshot?.language ?? 'de'),
      ...headingNumbering.supplements,
    },
    headingNumbering: headingNumbering.current,
    sheetName: (path) => project.sheetLabel(path),
    labels: {
      aria: (text) => i18n.t('xref.aria', { text }),
      missing: (label) => i18n.t('xref.missing', { label }),
      excluded: (label) => i18n.t('xref.excluded', { label }),
    },
    goTo: goToTarget,
    labelOther: labelInOtherSheet,
  }
}
