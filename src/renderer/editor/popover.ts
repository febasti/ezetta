import type { EditorView, TooltipView } from '@codemirror/view'

/**
 * Puts a tooltip in the horizontal middle of an area instead of under its position: it keeps the
 * line of the position (so it opens just below it, or above when it asks to be above, or when there
 * is no room), but its own middle is the middle of the area. `editor` is the visible area of the
 * editor, for the pickers that open at the caret and are read as a panel of their own; `text` is
 * the text column, for what is centered in it, such as a table.
 */
export function centered<T extends TooltipView>(
  view: EditorView,
  tooltip: T,
  on: 'editor' | 'text' = 'editor',
): T {
  tooltip.getCoords = (pos) => {
    const area = (on === 'editor' ? view.scrollDOM : view.contentDOM).getBoundingClientRect()
    const middle = (area.left + area.right) / 2
    const at = view.coordsAtPos(pos)
    // Without coordinates the position is out of view: a rectangle above the window hides the tooltip.
    return at
      ? { left: middle, right: middle, top: at.top, bottom: at.bottom }
      : { left: middle, right: middle, top: -1e5, bottom: -1e5 }
  }
  // CodeMirror puts the tooltip's left edge at the position plus this offset: half its width back.
  Object.defineProperty(tooltip, 'offset', {
    get: () => ({ x: -tooltip.dom.getBoundingClientRect().width / 2, y: 0 }),
  })
  return tooltip
}
