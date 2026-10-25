import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { numberFootnotes, plainText, scanFootnotes } from '@core/typst/footnotes'
import type { Footnote, FootnoteOffsets, FootnoteRestart } from '@core/typst/footnotes'
import { fullTree, sourceText } from './source'

/**
 * Where footnotes are shown and written: as cards in the margin, in a list below the
 * text, or in a card that floats over the text when a note is opened. Exactly one. Source mode is
 * the editor-wide "Quelltext" switch.
 */
export type NoteMode = 'margin' | 'list' | 'cards'

/** A small editor for the open note that is mounted in a place of the page: a margin card, a row of the list. */
export interface NoteEditorHandle {
  focus(): void
  destroy(): void
}

/** What the margin plugin found room for: cards in the margin, the notes panel instead (narrow
 * windows), or nothing to show. */
export type NotesLayout = 'none' | 'margin' | 'panel'

export interface FootnoteConfig {
  mode: NoteMode
  restart: FootnoteRestart
  /** Numbering state at the start of this sheet, from the sheets before it. */
  offsets: FootnoteOffsets
  labels: {
    /** Accessible name of a marker. */
    marker: (number: number, text: string) => string
    /** Accessible name of a margin card, which opens the note. */
    edit: (number: number) => string
    /** Title of the note editor. */
    card: (number: number) => string
    empty: string
  }
  /** Mounts the small editor of the open note in `host`: in a margin card or a row of the list, where it is written in place. */
  mountEditor?: (host: HTMLElement, view: EditorView) => NoteEditorHandle
  /** Draws the source of a note in `host` with the markup of the text (chips, highlights, emphasis); without it the plain text is shown. */
  drawText?: (
    view: EditorView,
    host: HTMLElement,
    source: string,
    wrap: boolean,
    onSize: () => void,
  ) => { update(source: string): boolean; destroy(): void }
  /** Opens a note. By default this is the note editor popover; the continuous view opens the sheet. */
  onOpen?: (view: EditorView, from: number) => void
  /** The margin plugin reports its layout, so the header and the notes panel can follow. */
  onLayout?: (info: { layout: NotesLayout; left: number; width: number }) => void
}

const DEFAULT_CONFIG: FootnoteConfig = {
  mode: 'margin',
  restart: 'continuous',
  offsets: { offset: 0, chapterOffset: 0 },
  labels: {
    marker: (number, text) => `${number}: ${text}`,
    edit: (number) => String(number),
    card: (number) => String(number),
    empty: '',
  },
}

export const footnoteConfig = Facet.define<Partial<FootnoteConfig>, FootnoteConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as FootnoteConfig,
})

/** A footnote of the sheet, with the number it shows and its text without markup. */
export interface NoteView extends Footnote {
  number: number
  text: string
}

/**
 * The notes of `state`. A note whose source is unchanged keeps the text it had in `previous`, so
 * typing elsewhere in the sheet does not take every note's markup off again.
 */
function compute(
  state: EditorState,
  previous?: { notes: readonly NoteView[]; doc: Text },
): readonly NoteView[] {
  const tree = fullTree(state)
  const doc = sourceText(state)
  const { notes } = scanFootnotes(tree, doc)
  const config = state.facet(footnoteConfig)
  const numbers = numberFootnotes(notes, config.restart, config.offsets)
  const known = new Map<string, string>()
  for (const note of previous?.notes ?? [])
    known.set(previous!.doc.sliceString(note.contentFrom, note.contentTo), note.text)
  return notes.map((note, index) => ({
    ...note,
    number: numbers[index]!,
    text:
      known.get(doc.slice(note.contentFrom, note.contentTo)) ??
      plainText(tree, doc, note.contentFrom, note.contentTo),
  }))
}

/** The footnotes of the document, rebuilt when the text, the syntax, or the numbering changes. */
export const footnoteField = StateField.define<readonly NoteView[]>({
  create: (state) => compute(state),
  update(value, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.facet(footnoteConfig) !== tr.startState.facet(footnoteConfig)
    return changed ? compute(tr.state, { notes: value, doc: tr.startState.doc }) : value
  },
})

export const openNoteEffect = StateEffect.define<number>()
export const closeNoteEffect = StateEffect.define<null>()

/** Start of the note whose editor is open, or null. Mapped through every change. */
export const activeNoteField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openNoteEffect)) return effect.value
      if (effect.is(closeNoteEffect)) return null
    }
    return value === null || !tr.docChanged ? value : tr.changes.mapPos(value, 1)
  },
})

/** The note that starts at `from`. */
export const noteStartingAt = (state: EditorState, from: number): NoteView | undefined =>
  state.field(footnoteField).find((note) => note.from === from)

/** The note whose editor is open. */
export function activeNote(state: EditorState): NoteView | undefined {
  const from = state.field(activeNoteField)
  return from === null ? undefined : noteStartingAt(state, from)
}

/** Opens the editor of the note at `from` (or whatever the configuration says to do instead). */
export function openNote(view: EditorView, from: number): void {
  const { onOpen } = view.state.facet(footnoteConfig)
  if (onOpen) onOpen(view, from)
  else view.dispatch({ effects: openNoteEffect.of(from) })
}

export function closeNote(view: EditorView): void {
  view.dispatch({ effects: closeNoteEffect.of(null) })
}

/** The small editor of the note that is open, by the view it edits: the tools of the toolbar go to it. */
export const noteEditors = new WeakMap<EditorView, EditorView>()
export const noteEditorOf = (view: EditorView): EditorView | null => noteEditors.get(view) ?? null
