import type { ProofIssue } from '@core/proof/issues'
import { applyIssue, recheck, showIssue } from './proofing'
import { insertTableCommand } from './tables'
import type { CitationOverview } from '@core/typst/citations'
import type { EditorView } from '@codemirror/view'
import type { InlineKind, ParagraphStyle } from '@core/typst/edit'
import { EditorView as CMEditorView } from '@codemirror/view'
import { historyField } from '@codemirror/commands'
import { footnoteField, noteEditorOf, openNote } from '../../editor/footnoteState'
import type { NotesLayout } from '../../editor/footnoteState'
import { analyzeSheet } from '@core/typst/text'
import { Autosaver } from '../../editor/autosave'
import type { SaveState } from '../../editor/autosave'
import { call } from '../../lib/api'
import { notify } from '../../lib/ui.svelte'
import { i18n } from '../../i18n/i18n.svelte'
import { contentHash } from '@core/project/contentHash'
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

/**
 * The editor's state as it was when its sheet left the editor (the panes side by side): its text,
 * its undo history (CodeMirror's state as JSON), and how far it was scrolled.
 */
export interface KeptState {
  path: string
  text: string
  json: unknown
  scroll: number
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
  /** How far the text starts scrolled, when it takes the place of a pane that was read. */
  initialScroll = $state<number | undefined>(undefined)
  /** Counts the edits, so a pane that shows the same sheet read-only can follow the typing. */
  liveVersion = $state(0)
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
  /** A kept state for the sheet about to be opened; used only if its text is the file's text. */
  private restore: KeptState | null = null
  private statsTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * The sheet's text as the editor last knew it on disk (read or written), as a `contentHash`. A
   * save sends it, so a file that another program changed meanwhile is not overwritten unseen.
   */
  private base: { path: string; hash: number } | null = null
  /** The writer chose to keep their version: the next save writes over the file on disk. */
  private overwriteNext = false

  private saver = new Autosaver({
    write: (path, content) => this.write(path, content),
    onState: (state) => (this.saveState = state),
  })

  /**
   * One save of the autosaver. While a conflict is open, a save is not made by the timer (the
   * autosaver is paused) but only when the writer moves on (another sheet, quitting): then their
   * text is written, and the file's text on disk goes to the trash as a copy, which a notice names.
   */
  private async write(path: string, content: string): Promise<boolean | 'held'> {
    const base = this.base?.path === path ? this.base.hash : undefined
    const overwrite = this.conflict || this.overwriteNext
    const result = await window.api.project.writeSheet({ path, content, base, overwrite })
    if (!result.ok) {
      if (result.error.code === 'conflict') {
        // Another program changed the file since it was read: the writer decides.
        if (this.path === path) {
          this.conflict = true
          this.saver.pause()
        }
        return 'held'
      }
      if (result.error.code === 'not_found' || result.error.code === 'invalid_path')
        this.orphaned = true
      return false
    }
    this.base = { path, hash: contentHash(content) }
    if (overwrite && this.path === path) {
      // This save settled the conflict in favour of the writer's text: saving goes on as usual.
      this.overwriteNext = false
      if (this.conflict) {
        this.conflict = false
        this.saver.resume()
      }
    }
    const kept = result.value.kept
    if (kept)
      notify(
        'info',
        i18n.t(kept.trashed ? 'editor.keptInTrash' : 'editor.keptBeside', { name: kept.name }),
        12_000,
      )
    return true
  }

  /** Text that could not be written: what is left after a flush when saving failed. */
  get hasUnsaved(): boolean {
    return this.saver.hasPending
  }

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

  /**
   * Opens a sheet. Unsaved text of the previous one is written first. `scroll` starts the text
   * scrolled that far; `restore` is a kept state of this sheet (with its undo history), taken only if
   * its text is exactly what the file holds now, else the sheet opens fresh from the file; `loaded`
   * runs in the same moment the sheet is taken, so what depends on it changes with it. Resolves
   * false only when the editor stayed with its sheet, whose text could not be written (`settle`).
   */
  async open(
    path: string,
    cursor?: number,
    options: { scroll?: number; restore?: KeptState | null; loaded?: () => void } = {},
  ): Promise<boolean> {
    if (path === this.path && cursor === undefined && options.restore === undefined) {
      this.handle?.focus()
      return true
    }
    const ticket = ++this.opening
    if (!(await this.settle())) return false
    const result = await call(window.api.project.readSheet({ path }))
    if (ticket !== this.opening || result === null) return true
    this.initialCursor = cursor
    this.initialScroll = options.scroll
    this.restore = options.restore?.path === path ? options.restore : null
    options.loaded?.()
    this.load(path, result.content)
    return true
  }

  /**
   * The kept state to mount with, if there is one for this sheet and its text is the text the
   * editor mounts with (the file's). Asked once: a state that does not match is dropped.
   */
  takeRestore(text: string): KeptState | null {
    const kept = this.restore
    this.restore = null
    return kept !== null && kept.path === this.path && kept.text === text ? kept : null
  }

  /** The open sheet's state, to keep while it is shown read-only beside the editor. */
  keepState(): KeptState | null {
    const handle = this.handle
    if (!handle || this.path === null) return null
    return {
      path: this.path,
      text: handle.getContent(),
      json: handle.view.state.toJSON({ history: historyField }),
      scroll: handle.view.scrollDOM.scrollTop,
    }
  }

  /** The open sheet's text as it is in the editor now (saved or not), or null. */
  currentText(): string | null {
    return this.handle?.getContent() ?? null
  }

  private load(path: string, content: string): void {
    this.base = { path, hash: contentHash(content) }
    this.overwriteNext = false
    this.path = path
    this.initial = content
    this.mountKey += 1
    this.conflict = false
    this.orphaned = false
    this.liveStats = analyzeSheet(content)
  }

  /**
   * Closes the open sheet. Resolves false when it stays open: its text could not be written, and
   * the writer went back to it. With `force` it closes whatever happens (its file is going away, or
   * the project has already been replaced).
   */
  async close(options: { force?: boolean } = {}): Promise<boolean> {
    this.opening += 1
    if (options.force) await this.flush()
    else if (!(await this.settle())) return false
    this.path = null
    this.initial = ''
    this.initialCursor = undefined
    this.initialScroll = undefined
    this.restore = null
    this.conflict = false
    this.orphaned = false
    this.overwriteNext = false
    this.base = null
    this.saver.discard()
    this.mountKey += 1
    return true
  }

  /**
   * Asks the writer about text that could not be written, before it is left behind: true to give
   * it up, false to go back to it. Set by the project, which knows what the sheets are called.
   * Until then nothing is given up.
   */
  askUnsaved: (path: string) => Promise<boolean> = () => Promise.resolve(false)

  /**
   * Writes what is unsaved, before the text in the editor is left (another sheet, another view,
   * another project). Text that could not be written (a full disk, a folder that is gone) is not
   * dropped silently: the writer is asked. Resolves true when the editor may move on.
   */
  async settle(): Promise<boolean> {
    await this.flush()
    // This save found that the file changed on disk: moving on settles it for the writer's text,
    // and the file's goes to the trash as a copy (see `write`).
    if (this.saver.hasPending && this.conflict) await this.flush()
    if (!this.saver.hasPending || this.path === null) return true
    if (!(await this.askUnsaved(this.path))) return false
    this.saver.discard()
    return true
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
    this.liveVersion += 1
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
    this.overwriteNext = false
    this.base = { path: this.path, hash: contentHash(result.content) }
    this.initial = result.content
    this.handle?.setContent(result.content)
    this.liveStats = analyzeSheet(result.content)
  }

  /** Keeps the text in the editor and writes it over the file on disk. */
  keepMine(): void {
    this.conflict = false
    this.overwriteNext = true
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
    if (this.base !== null && isSameOrBelow(this.base.path, from))
      this.base = { ...this.base, path: rebase(this.base.path, from, to) }
  }

  isAffected(path: string): boolean {
    return this.path !== null && isSameOrBelow(this.path, path)
  }
}

export const editor = new EditorStore()
