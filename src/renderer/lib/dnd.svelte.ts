export type DropPosition = 'before' | 'after' | 'inside'

/** Where in a row a drag is hovering. Rows that can contain things have a middle "inside" zone. */
export function dropPosition(
  event: DragEvent,
  row: HTMLElement,
  canContain: boolean,
): DropPosition {
  const rect = row.getBoundingClientRect()
  const y = (event.clientY - rect.top) / Math.max(1, rect.height)
  if (canContain) return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
  return y < 0.5 ? 'before' : 'after'
}

/** The paths currently being dragged. `dataTransfer` data is unreadable during dragover, so the
 * drag lives here. */
export const drag = $state<{ paths: string[] }>({ paths: [] })

/** The row a drag currently hovers, for the drop indicator. */
export const dropTarget = $state<{ path: string | null; position: DropPosition }>({
  path: null,
  position: 'inside',
})

export function clearDrag(): void {
  drag.paths = []
  dropTarget.path = null
}
