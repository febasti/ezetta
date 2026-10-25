import { defaultKeymap, redo, undo } from '@codemirror/commands'
import { Annotation, EditorState, Facet, Prec } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, showTooltip } from '@codemirror/view'
import type { KeyBinding, TooltipView, ViewUpdate } from '@codemirror/view'
import {
  activeNote,
  activeNoteField,
  closeNote,
  footnoteConfig,
  footnoteField,
  noteEditors,
} from '../../editor/footnoteState'
import type { NoteEditorHandle } from '../../editor/footnoteState'
import { editor } from './editorSession.svelte'
import { activeCiteField, citeConfig, citeField, missingField } from '../../editor/citeState'
import { citeComplete } from './citeComplete'
import { citeEditor, citeLabelsFacet } from './citeEditor'
import { labelsFacet, markupExtension, showSourceFacet } from '../../editor/markup'
import { cspNonceExtension, noBrowserProofing } from '../../editor/theme'
import { typstLanguage } from '../../editor/typst'

/** Extra key bindings for the note editor (the formatting commands), supplied by the editor so this
 * module does not depend on them. */
export const noteKeymapFacet = Facet.define<readonly KeyBinding[], readonly KeyBinding[]>({
  combine: (values) => values.flat(),
})

/** Marks changes the note editor sent to the document, and changes the document sent back. */
const forwarded = Annotation.define<boolean>()
const fromDocument = Annotation.define<boolean>()

// The popover sits inside the main editor's DOM, so the main theme's rules (a column width and a
// large bottom padding for the writing surface) also reach this editor. The doubled selector
// (`&.cm-editor`) makes these rules win over them.
const noteTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--color-label)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-editor .cm-scroller': {
    fontFamily: 'var(--font-writing)',
    fontSize: '15.5px',
    lineHeight: '1.55',
    maxHeight: '40vh',
    overflow: 'auto',
  },
  '&.cm-editor .cm-content': {
    maxWidth: 'none',
    margin: '0',
    padding: 'var(--sp-4) 0',
    caretColor: 'var(--color-label)',
  },
  '&.cm-editor .cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--color-label)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    // Stronger than the editor's own: the open note sits on the accent background of its card or row.
    { backgroundColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)' },
})

/** The note editors that are mounted, by the view they edit: each follows changes in the document. */
const mounted = new WeakMap<EditorView, Set<{ update(update: ViewUpdate): void }>>()

/**
 * Mounts a small editor on the open note in `host`. It has the same extensions as the
 * main editor. What is typed is dispatched into the main document as normal transactions at the
 * matching range, so there is one undo history. Undo and redo inside it run on the main editor, and
 * it follows when the text changes under it. Leaving it (a click elsewhere) closes the note.
 * Where it is mounted depends on the mode: in a margin card, in a row of the list, or in the card
 * that floats over the text.
 */
export function mountNoteEditor(host: HTMLElement, view: EditorView): NoteEditorHandle {
  const initial = activeNote(view.state)!
  const config = view.state.facet(footnoteConfig)

  const close = (): void => {
    const note = activeNote(view.state)
    closeNote(view)
    view.focus()
    if (note) view.dispatch({ selection: { anchor: Math.min(note.to, view.state.doc.length) } })
  }

  const nested = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: view.state.sliceDoc(initial.contentFrom, initial.contentTo),
      extensions: [
        drawSelection(),
        EditorView.lineWrapping,
        Prec.high(
          keymap.of([
            ...view.state.facet(noteKeymapFacet),
            { key: 'Escape', run: () => (close(), true) },
            { key: 'Mod-z', run: () => undo(view), preventDefault: true },
            { key: 'Mod-Shift-z', run: () => redo(view), preventDefault: true },
            { key: 'Mod-y', run: () => redo(view), preventDefault: true },
          ]),
        ),
        keymap.of(defaultKeymap),
        typstLanguage.extension,
        // Citations show as chips in a note too, and open the citation editor, as in the text; so
        // does the Beleg command, and `@` offers the works.
        citeField,
        missingField,
        activeCiteField,
        citeConfig.of({ ...view.state.facet(citeConfig), onOpen: undefined }),
        ...(view.state.facet(citeLabelsFacet)
          ? [citeLabelsFacet.of(view.state.facet(citeLabelsFacet)!)]
          : []),
        citeEditor,
        citeComplete,
        markupExtension({
          showSource: view.state.facet(showSourceFacet),
          labels: view.state.facet(labelsFacet),
        }),
        noteTheme,
        ...cspNonceExtension(),
        noBrowserProofing(view.contentDOM.lang || 'de', config.labels.card(initial.number)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || update.transactions.some((tr) => tr.annotation(fromDocument)))
            return
          const note = activeNote(view.state)
          if (!note) return
          const changes: { from: number; to: number; insert: string }[] = []
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            changes.push({
              from: note.contentFrom + fromA,
              to: note.contentFrom + toA,
              insert: inserted.toString(),
            })
          })
          view.dispatch({ changes, annotations: forwarded.of(true), userEvent: 'input.type' })
        }),
      ],
    }),
  })

  // Leaving the editor (a click elsewhere) closes the note.
  const onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null
    if (next && host.contains(next)) return
    queueMicrotask(() => {
      if (view.state.field(activeNoteField) !== null && !host.contains(document.activeElement))
        closeNote(view)
    })
  }
  host.addEventListener('focusout', onFocusOut)

  const follow = {
    update(update: ViewUpdate): void {
      if (!update.docChanged || update.transactions.some((tr) => tr.annotation(forwarded))) return
      // The text changed under the editor (undo, redo, an outside edit): show the current text.
      const note = activeNote(update.state)
      if (!note) return
      const wanted = update.state.sliceDoc(note.contentFrom, note.contentTo)
      if (wanted !== nested.state.doc.toString()) {
        nested.dispatch({
          changes: { from: 0, to: nested.state.doc.length, insert: wanted },
          annotations: fromDocument.of(true),
        })
      }
    },
  }
  const all = mounted.get(view) ?? new Set()
  all.add(follow)
  mounted.set(view, all)

  noteEditors.set(view, nested)
  return {
    focus() {
      nested.focus()
      nested.dispatch({ selection: { anchor: nested.state.doc.length } })
    },
    destroy() {
      host.removeEventListener('focusout', onFocusOut)
      mounted.get(view)?.delete(follow)
      if (noteEditors.get(view) === nested) noteEditors.delete(view)
      nested.destroy()
    },
  }
}

/** The floating card (mode "cards"): a title and the note editor, over the text at the marker. */
function createNoteCard(view: EditorView): TooltipView {
  const initial = activeNote(view.state)!
  const dom = document.createElement('div')
  dom.className = 'cm-note-editor k-popover'
  const title = document.createElement('div')
  title.className = 'cm-note-editor-title'
  title.textContent = view.state.facet(footnoteConfig).labels.card(initial.number)
  const host = document.createElement('div')
  dom.append(title, host)
  const handle = mountNoteEditor(host, view)
  return {
    dom,
    mount() {
      handle.focus()
    },
    update(update) {
      const note = activeNote(update.state)
      if (note) title.textContent = update.state.facet(footnoteConfig).labels.card(note.number)
    },
    destroy() {
      handle.destroy()
    },
  }
}

/**
 * What lets a note be written in place, and the floating card for the mode that wants one. The
 * field that tracks which note is open belongs here too, and the open note's place in the sheet is
 * told to the store, for the list below the text.
 */
export const footnoteEditor: Extension = [
  activeNoteField,
  showTooltip.compute([activeNoteField, footnoteField, footnoteConfig], (state) => {
    const note = activeNote(state)
    return note && state.facet(footnoteConfig).mode === 'cards'
      ? { pos: note.from, above: false, strictSide: true, arrow: false, create: createNoteCard }
      : null
  }),
  EditorView.updateListener.of((update) => {
    for (const follower of mounted.get(update.view) ?? []) follower.update(update)
    const from = update.state.field(activeNoteField)
    const index =
      from === null ? -1 : update.state.field(footnoteField).findIndex((n) => n.from === from)
    editor.setActiveNote(index === -1 ? null : index)
  }),
]
