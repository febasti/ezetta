import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { DEFAULT_FIGURE_WIDTH, insertFigure } from '@core/typst/edit'
import { replaceFigureImage } from '@core/typst/figures'
import { call } from '../../lib/api'
import { i18n } from '../../i18n/i18n.svelte'
import { focusFigureCaption } from '../../editor/figureWidget'
import { figureField } from '../../editor/figureState'

export type ImageKind = 'figure' | 'inline'

/**
 * Inserts an image that is already in the project's `assets/` folder, or, with an empty path, a
 * figure without an image yet (a placeholder). A figure puts the focus in its caption field, so the
 * caption can be typed right away; an image in the text just appears.
 */
export function insertImage(view: EditorView, path: string, kind: ImageKind, at?: number): void {
  if (at !== undefined)
    view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } })
  const { from, to } = view.state.selection.main
  const result = insertFigure(
    { doc: view.state.doc.toString(), tree: syntaxTree(view.state), from, to },
    { kind, path },
  )
  if (result.changes.length === 0) return
  view.dispatch({
    changes: result.changes,
    selection: { anchor: result.anchor },
    scrollIntoView: true,
    userEvent: 'input.paste',
  })
  if (kind !== 'figure') return
  const created = view.state.field(figureField).find((figure) => figure.end === result.anchor)
  if (created) focusFigureCaption(view, created.from)
}

/** Inserts a figure without an image: an empty frame with a button to choose the file later. */
export function insertPlaceholder(view: EditorView): void {
  insertImage(view, '', 'figure')
}

/** Asks for an image file with the system dialog, and copies it into the project. */
async function chooseFile(): Promise<string | null> {
  const chosen = await call(
    window.api.project.chooseImage({
      dialogTitle: i18n.t('dialog.chooseImage'),
      filterName: i18n.t('dialog.imageFilter'),
    }),
  )
  return chosen?.path ?? null
}

/** Asks for an image with the system dialog, copies it into the project, and inserts it in the text. */
export async function chooseAndInsert(view: EditorView, kind: ImageKind): Promise<void> {
  const path = await chooseFile()
  view.focus()
  if (path) insertImage(view, path, kind)
}

/**
 * Asks for an image and puts it in the figure that starts at `from`: its first image, or instead of
 * the one it has. Only the path changes, so the figure keeps its id (the label that references
 * point at), its caption, and its other arguments.
 */
export async function chooseAndReplace(view: EditorView, from: number): Promise<void> {
  const path = await chooseFile()
  if (!path) return
  // The sheet may have changed while the dialog was open: find the figure again.
  const figure = view.state.field(figureField).find((f) => f.from === from)
  if (!figure) return
  view.dispatch({ changes: replaceFigureImage(figure, path, DEFAULT_FIGURE_WIDTH) })
  view.focus()
}

/** The image files in a paste or a drop. */
export function imageFilesOf(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter((file) => file.type.startsWith('image/')) : []
}

/** Adds pasted or dropped image files to the project and inserts each as a figure. */
export async function importFiles(view: EditorView, files: File[], at?: number): Promise<void> {
  let position = at
  for (const file of files.slice(0, 10)) {
    const data = new Uint8Array(await file.arrayBuffer())
    const added = await call(window.api.project.addImage({ name: file.name || 'bild', data }))
    if (!added) continue
    insertImage(view, added.path, 'figure', position)
    position = undefined // the next one goes after the one just inserted
  }
}
