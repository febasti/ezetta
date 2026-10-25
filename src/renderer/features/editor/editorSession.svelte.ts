import type { ProofIssue } from '@core/proof/issues'
import { applyIssue, recheck, showIssue } from './proofing'
import { insertTableCommand } from './tables'
import type { CitationOverview } from '@core/typst/citations'
import type { EditorView } from '@codemirror/view'
import type { InlineKind, ParagraphStyle } from '@core/typst/edit'
import { EditorView as CMEditorView } from '@codemirror/view'
import { footnoteField, noteEditorOf, openNote } from '../../editor/footnoteState'
import type { NotesLayout } from '../../editor/footnoteState'
import { analyzeSheet } from '@core/typst/text'
import { Autosaver } from '../../editor/autosave'
import type { SaveState } from '../../editor/autosave'
import { call } from '../../lib/api'
import type { MenuItem } from '../../lib/menu.svelte'
import { isSameOrBelow, rebase } from '@core/project/paths'
import { paragraphMenu, runEditorCommand } from './editorCommands'
import type { EditorCommandId } from './editorCommands'

/** A footnote as the notes panel lists it. */
export interface SheetNote {
  number: number
  text: string
  /** The note's source, drawn with the markup of the text. */
  source: string
}

/** What the mounted CodeMirror view offers to the store. */
export interface EditorHandle {
  view: EditorView
  getContent(): string
  setContent(text: string): void
  focus(): void
}

class EditorStore {
  /** The open sheet, or null. */
  path = $state<string | null>(null)
  /** Content the editor mounts with. Bumping `mountKey` remounts the editor. */
  initial = $state('')
  mountKey = $state(0)
  /** Where the cursor starts when a sheet opens from the continuous view (a file offset). */
  initialCursor = $state<number | undefined>(undefined)
  saveState = $state<SaveState>('saved')
  /** The file changed on disk while there are unsaved edits here. */
  conflict = $state(false)
  /** The open file is gone from the project (moved or deleted outside the app). */
  orphaned = $state(false)
  liveStats = $state({ words: 0, footnoteWords: 0 })
  /** Paragraph style at the caret, for the status bar and the toolbar. */
  paragraph = $state<ParagraphStyle>({ kind: 'text' })
  /** Inline formats at the caret, for the pressed states in the toolbar. */
  formats = $state<Record<InlineKind, boolean>>({
    emphasis: false,
    strong: false,
    highlight: false,
    subscript: false,
    superscript: false,
    smallcaps: false,
  })
  /** The caret is in an inline quote, for the pressed state of the quote tool. */
  inlineQuote = $state(false)
  /** What the open sheet cites right now, for the list of works. Null without a sheet. */
  liveCitations = $state.raw<CitationOverview | null>(null)
  /** The sheet's footnotes in order, for the notes panel. */
  notes = $state.raw<readonly SheetNote[]>([])
  /** Margin cards, the panel instead (no room), or no notes at all. */
  notesLayout = $state<NotesLayout>('none')
  /** The place of the note that is open for writing, among the sheet's notes; null when none is. */
  activeNote = $state<number | null>(null)
  /** The spelling and grammar issues of the open sheet, in text order. */
  issues = $state.raw<readonly ProofIssue[]>([])
  /** The checker is at work on the open sheet (or waits for the server to start). */
  proofChecking = $state(false)
  canUndo = $state(false)
  canRedo = $state(false)

  private handle: EditorHandle | null = null
  private opening = 0
  private statsTimer: ReturnType<typeof setTimeout> | null = null

  private saver = new Autosaver({
    write: async (path, content) => {
      const result = await window.api.project.writeSheet({ path, content })
      if (!result.ok && (result.error.code === 'not_found' || result.error.code === 'invalid_path'))
        this.orphaned = true
      return result.ok
    },
    onState: (state) => (this.saveState = state),
  })

  setIssues(issues: readonly ProofIssue[]): void {
    this.issues = issues
  }

  setProofChecking(checking: boolean): void {
    this.proofChecking = checking
  }

  /** Checks the whole sheet again, ignoring what the checker answered before. */
  recheck(): void {
    if (this.handle) recheck(this.handle.view)
  }

  /** Shows an issue in the text (scrolled to, marked) without selecting it; null takes the mark away. */
  showIssue(issue: ProofIssue | null): void {
    if (this.handle) showIssue(this.handle.view, issue)
  }

  /** Puts a suggestion in the place of an issue. The issue leaves the list at once. */
  applyIssue(issue: ProofIssue, value: string): void {
    if (this.handle && applyIssue(this.handle.view, issue, value))
      this.issues = this.issues.filter((i) => i !== issue)
  }

  private attachListeners = new Set<(handle: EditorHandle) => void>()

  /** Called whenever an editor view is mounted, for features that keep state outside of it. */
  onAttach(listener: (handle: EditorHandle) => void): void {
    this.attachListeners.add(listener)
  }

  /** The mounted view, or null when no sheet is open in the editor. */
  get view(): EditorView | null {
    return this.handle?.view ?? null
  }

  focus(): void {
    this.handle?.focus()
  }

  attach(handle: EditorHandle): void {
    this.handle = handle
    for (const listener of this.attachListeners) listener(handle)
  }

  detach(handle: EditorHandle): void {
    if (this.handle === handle) this.handle = null
  }

  /** Opens a sheet. Unsaved text of the previous one is written first. */
  async open(path: string, cursor?: number): Promise<void> {
    if (path === this.path && cursor === undefined) {
      this.handle?.focus()
      return
    }
    const ticket = ++this.opening
    await this.flush()
    const result = await call(window.api.project.readSheet({ path }))
    if (ticket !== this.opening || result === null) return
    this.initialCursor = cursor
    this.load(path, result.content)
  }

  private load(path: string, content: string): void {
    this.path = path
    this.initial = content
    this.mountKey += 1
    this.conflict = false
    this.orphaned = false
    this.liveStats = analyzeSheet(content)
  }

  async close(): Promise<void> {
    this.opening += 1
    await this.flush()
    this.path = null
    this.initial = ''
    this.initialCursor = undefined
    this.conflict = false
    this.orphaned = false
    this.saver.discard()
    this.mountKey += 1
  }

  async flush(): Promise<void> {
    await this.saver.flush()
  }

  /** The editor lost focus. Saves, unless a conflict with the file on disk is still open. */
  async flushOnBlur(): Promise<void> {
    await this.saver.flush({ respectPause: true })
  }

  /** Runs a text command (emphasis, heading, comment, …) on the open sheet. */
  run(id: EditorCommandId): void {
    if (!this.handle) return
    // While a note is open for writing, what the tools do is done in the note.
    const note = noteEditorOf(this.handle.view)
    // A menu gives focus back to its button: typing goes on in the editor, and a command that
    // opens a popover moves the focus there itself, after this.
    if (note) note.focus()
    else this.handle.focus()
    runEditorCommand(note ?? this.handle.view, id)
  }

  setToolState(
    formats: Record<InlineKind, boolean>,
    inlineQuote: boolean,
    canUndo: boolean,
    canRedo: boolean,
  ): void {
    this.inlineQuote = inlineQuote
    if (
      formats.emphasis !== this.formats.emphasis ||
      formats.strong !== this.formats.strong ||
      formats.highlight !== this.formats.highlight ||
      formats.subscript !== this.formats.subscript ||
      formats.superscript !== this.formats.superscript ||
      formats.smallcaps !== this.formats.smallcaps
    ) {
      this.formats = formats
    }
    this.canUndo = canUndo
    this.canRedo = canRedo
  }

  /** Items of the paragraph style menu for the status bar. */
  paragraphMenuItems(): MenuItem[] {
    return this.handle ? paragraphMenu(this.handle.view, this.paragraph) : []
  }

  /** Inserts a table of this size at the caret and starts editing it. */
  insertTable(rows: number, columns: number): void {
    if (!this.handle) return
    this.handle.focus()
    insertTableCommand(this.handle.view, rows, columns)
  }

  setCitations(overview: CitationOverview | null): void {
    this.liveCitations = overview
  }

  /** Takes the sheet's notes. Positions are left out: typing that only moves notes changes nothing here. */
  setNotes(notes: readonly SheetNote[]): void {
    const same =
      notes.length === this.notes.length &&
      notes.every(
        (note, i) =>
          note.number === this.notes[i]!.number &&
          note.text === this.notes[i]!.text &&
          note.source === this.notes[i]!.source,
      )
    if (!same) this.notes = notes
  }

  setActiveNote(index: number | null): void {
    if (this.activeNote !== index) this.activeNote = index
  }

  setNotesLayout(layout: NotesLayout): void {
    this.notesLayout = layout
  }

  /** Scrolls the marker of the sheet's `index`-th note into view and opens its editor. */
  openNote(index: number): void {
    const view = this.handle?.view
    const note = view?.state.field(footnoteField)[index]
    if (!view || !note) return
    view.dispatch({ effects: CMEditorView.scrollIntoView(note.from, { y: 'center' }) })
    openNote(view, note.from)
  }

  setParagraph(style: ParagraphStyle): void {
    const current = this.paragraph
    if (
      current.kind !== style.kind ||
      (current.kind === 'heading' && style.kind === 'heading' && current.level !== style.level)
    ) {
      this.paragraph = style
    }
  }

  /** The editor reports a change in the document. */
  edited(): void {
    if (this.path === null || this.handle === null) return
    const handle = this.handle
    this.saver.edit(this.path, () => handle.getContent())
    if (this.statsTimer) clearTimeout(this.statsTimer)
    this.statsTimer = setTimeout(() => {
      this.liveStats = analyzeSheet(handle.getContent())
    }, 250)
  }

  /** Discards the editor's text and shows what is on disk. */
  async reload(): Promise<void> {
    if (this.path === null) return
    const result = await call(window.api.project.readSheet({ path: this.path }))
    if (result === null) return
    this.saver.discard() // also resumes autosave
    this.conflict = false
    this.initial = result.content
    this.handle?.setContent(result.content)
    this.liveStats = analyzeSheet(result.content)
  }

  /** Keeps the text in the editor and writes it over the file on disk. */
  keepMine(): void {
    this.conflict = false
    this.saver.resume()
    this.edited()
  }

  /** A snapshot arrived. `changed` lists sheets whose disk content differs from what the app knows. */
  onProjectChanged(changed: readonly string[], sheetExists: (path: string) => boolean): void {
    if (this.path === null) return
    this.orphaned = !sheetExists(this.path)
    if (this.orphaned || !changed.includes(this.path)) return
    if (this.saver.hasPending) {
      // Do not let a timer save overwrite the other version before the writer has chosen.
      this.conflict = true
      this.saver.pause()
    } else void this.reload()
  }

  /** A group or sheet was renamed or moved inside the app. */
  pathChanged(from: string, to: string): void {
    if (this.path !== null && isSameOrBelow(this.path, from))
      this.path = rebase(this.path, from, to)
  }

  isAffected(path: string): boolean {
    return this.path !== null && isSameOrBelow(this.path, path)
  }
}

export const editor = new EditorStore()
