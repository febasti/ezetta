import { isSameOrBelow, rebase } from '@core/project/paths'
import { i18n } from '../../i18n/i18n.svelte'
import { notify } from '../../lib/ui.svelte'
import { editor } from './editorSession.svelte'
import type { KeptState } from './editorSession.svelte'

/** Opens a sheet in the editor: the project's way of doing it (it also sets the editor mode). */
type OpenSheet = (
  path: string,
  cursor: number,
  options: { scroll?: number; restore?: KeptState | null; loaded?: () => void },
) => Promise<void>

/**
 * Two sheets side by side. There is still one editor: it stands in one pane, and the other pane shows
 * a sheet read-only, drawn like the text. A click into the read-only pane moves the editor there:
 * the text in the editor is saved first (if it cannot be, nothing moves), and the sheet that leaves
 * keeps its undo history for when it comes back, as long as its file still holds that text.
 * Nothing here writes a file; the panes swap places by style, so neither is drawn anew for it.
 */
class SplitStore {
  /** The sheet in the read-only pane, or null: one pane. */
  other = $state<string | null>(null)
  /** Where the editor stands; the read-only pane is on the other side. */
  editorSide = $state<'left' | 'right'>('left')
  /** How far the read-only pane starts scrolled when its sheet changes (where the editor was). */
  otherScroll = 0
  /** How far the read-only pane is scrolled now, asked when the editor takes its place. */
  readScroll: () => number = () => 0
  /** A switch is under way: another click waits for it. */
  private switching = false
  /** The states of the sheets that left the editor, by path: at most the two of the panes. */
  private kept = new Map<string, KeptState>()

  /** Shows `path` read-only beside the editor. */
  openBeside(path: string): void {
    this.otherScroll = 0
    this.other = path
  }

  close(): void {
    if (this.other !== null) this.kept.delete(this.other)
    this.other = null
  }

  /** Forgets everything: another project, or none. */
  reset(): void {
    this.other = null
    this.editorSide = 'left'
    this.kept.clear()
  }

  /**
   * Moves the editor into the read-only pane, with the caret at `offset` of its sheet. Returns false
   * when it did not move: the text in the editor could not be saved, so it stays where it is.
   */
  async activate(offset: number, open: OpenSheet): Promise<boolean> {
    const target = this.other
    const from = editor.path
    if (target === null || from === null || this.switching) return false
    this.switching = true
    try {
      const leaving = editor.keepState()
      const scroll = this.readScroll()
      await editor.flush()
      if (editor.hasUnsaved) {
        notify('error', i18n.t('split.unsaved'))
        return false
      }
      if (leaving) this.kept.set(from, leaving)
      const restore = this.kept.get(target) ?? null
      this.kept.delete(target)
      for (const path of this.kept.keys()) if (path !== from) this.kept.delete(path)
      await open(target, offset, {
        scroll,
        restore,
        // In the moment the editor takes the sheet, the panes trade places and sheets.
        loaded: () => {
          this.otherScroll = leaving?.scroll ?? 0
          this.other = from
          this.editorSide = this.editorSide === 'left' ? 'right' : 'left'
        },
      })
      return true
    } finally {
      this.switching = false
    }
  }

  /** A group or sheet was renamed or moved inside the app. */
  pathChanged(from: string, to: string): void {
    if (this.other !== null && isSameOrBelow(this.other, from))
      this.other = rebase(this.other, from, to)
    for (const [path, state] of [...this.kept]) {
      if (!isSameOrBelow(path, from)) continue
      this.kept.delete(path)
      const moved = rebase(path, from, to)
      this.kept.set(moved, { ...state, path: moved })
    }
  }
}

export const split = new SplitStore()
