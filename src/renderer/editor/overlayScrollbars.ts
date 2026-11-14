import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'
import { scrollbar } from '../ui/scrollbar'

/** The lists in the editor's own popovers that scroll: the `@` and `/` menus, the targets of a
 * cross-reference. Only the popovers of this editor (a note's editor has its own). */
const LISTS = ':scope > .cm-tooltip-autocomplete > ul, :scope > .cm-tooltip .cm-ref-results'

/**
 * The app's own scrollbar (ui/scrollbar.ts) on the editor and on the lists of its popovers, which
 * CodeMirror makes and replaces as it goes, so they are looked for after every update.
 */
export const overlayScrollbars = ViewPlugin.fromClass(
  class {
    private readonly bars = new Map<HTMLElement, { destroy(): void }>()

    constructor(private readonly view: EditorView) {
      this.bars.set(view.scrollDOM, scrollbar(view.scrollDOM))
      this.sync()
    }

    update(_update: ViewUpdate): void {
      // After the popovers have drawn this update.
      queueMicrotask(() => this.sync())
    }

    private sync(): void {
      for (const [list, bar] of this.bars) {
        if (list !== this.view.scrollDOM && !list.isConnected) {
          bar.destroy()
          this.bars.delete(list)
        }
      }
      for (const list of this.view.dom.querySelectorAll<HTMLElement>(LISTS))
        if (!this.bars.has(list)) this.bars.set(list, scrollbar(list))
    }

    destroy(): void {
      for (const bar of this.bars.values()) bar.destroy()
      this.bars.clear()
    }
  },
)
