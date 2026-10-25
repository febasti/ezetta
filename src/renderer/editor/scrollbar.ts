import type { EditorView } from '@codemirror/view'

/**
 * Reports the width of the editor's vertical scrollbar (0 with overlay scrollbars). The editor
 * centers its text in the area left of the scrollbar, so the header above it reserves the same
 * width to line up. (A scrollbar gutter in CSS would do that too, but it shifts the text away from
 * CodeMirror's cursor and selection layers.)
 */
export function watchScrollbarWidth(
  view: EditorView,
  onChange: (width: number) => void,
): () => void {
  const scroller = view.scrollDOM
  let last = -1
  const measure = (): void => {
    const width = scroller.offsetWidth - scroller.clientWidth
    if (width !== last) {
      last = width
      onChange(width)
    }
  }
  const observer = new ResizeObserver(measure)
  observer.observe(scroller)
  observer.observe(view.contentDOM)
  measure()
  return () => observer.disconnect()
}
