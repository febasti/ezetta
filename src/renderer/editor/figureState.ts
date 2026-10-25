import { syntaxTree } from '@codemirror/language'
import { Facet, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { isSafeRelativePath } from '@core/project/paths'
import { scanFigures } from '@core/typst/figures'
import type { Figure } from '@core/typst/figures'
import { fullTree, sourceText } from './source'

export interface FigureConfig {
  /** Numbered figures in the sheets before this one, so numbering runs on across the project. */
  offset: number
  /** The word before the number ("Abbildung", "Figure"): the language of the text, not of the UI. */
  supplement: string
  /** The mark after the number of the caption: ":" in "Abbildung 1:". */
  separator: string
  labels: {
    aria: (supplement: string, number: number, caption: string) => string
    ariaPlain: (caption: string) => string
    missing: (path: string) => string
    invalid: (path: string) => string
    /** The notice in a figure that has no image yet. */
    empty: string
    chooseImage: string
    replaceImage: string
    captionPlaceholder: string
    captionInvalid: string
    /** The name of the tools over the image, and of the group of widths in them. */
    tools: string
    width: string
    widthOf: (value: string) => string
  }
  /**
   * Set where the text is read only (the continuous view): a click on an image opens the sheet, and
   * the figures have no tools and no caption field.
   */
  onOpen?: (view: EditorView, from: number) => void
  /** Asks for an image file and puts it in the figure that starts at `from` (the first or another one). */
  pick: (view: EditorView, from: number) => void
}

const DEFAULT_CONFIG: FigureConfig = {
  offset: 0,
  supplement: 'Abbildung',
  separator: ':',
  labels: {
    aria: (supplement, number, caption) => `${supplement} ${number}: ${caption}`,
    ariaPlain: (caption) => caption,
    missing: (path) => path,
    invalid: (path) => path,
    empty: '',
    chooseImage: '',
    replaceImage: '',
    captionPlaceholder: '',
    captionInvalid: '',
    tools: '',
    width: '',
    widthOf: (value) => value,
  },
  pick: () => undefined,
}

export const figureConfig = Facet.define<Partial<FigureConfig>, FigureConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as FigureConfig,
})

/** A figure of the sheet, with the number it shows (only numbered figures have one). */
export interface FigureView extends Figure {
  number: number | null
}

function compute(state: EditorState): readonly FigureView[] {
  const tree = fullTree(state)
  const { offset } = state.facet(figureConfig)
  let count = offset
  return scanFigures(tree, sourceText(state)).map((figure) => ({
    ...figure,
    number: figure.kind === 'figure' ? ++count : null,
  }))
}

/** The images of the document, rebuilt when the text, the syntax, or the numbering changes. */
export const figureField = StateField.define<readonly FigureView[]>({
  create: (state) => compute(state),
  update(value, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.facet(figureConfig) !== tr.startState.facet(figureConfig)
    return changed ? compute(tr.state) : value
  },
})

/**
 * The address of a project image for an <img>. The path must be a plain relative path inside the
 * project; anything else gets no address, so the widget shows a notice instead of loading it. The
 * main process checks again, and only ever serves image files from inside the open project.
 */
export function assetUrl(path: string): string | null {
  if (path === '' || !isSafeRelativePath(path)) return null
  return `project-asset://project/${path.split('/').map(encodeURIComponent).join('/')}`
}
