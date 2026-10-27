/**
 * Where a drag would land in the list of sheets: before or after a row, or at the end of the group
 * (a drop below the last row). Decided from the pointer's height alone, so the gaps between rows
 * and the space under the list land somewhere too, and the line that shows it never disappears.
 */
export type DropSlot = { end: true } | { path: string; position: 'before' | 'after' }

export interface RowSpan {
  path: string
  top: number
  bottom: number
}

/**
 * The slot at height `y` for rows in list order, or null where the drop would change nothing (over
 * a row that is being dragged itself). Between two rows the nearer one decides, and when that one is
 * being dragged the other side of the gap, which is the same place, takes over.
 */
export function slotAt(
  y: number,
  rows: readonly RowSpan[],
  isDragged: (path: string) => boolean,
): DropSlot | null {
  const last = rows[rows.length - 1]
  if (!last || y > last.bottom) return { end: true }
  const index = rows.findIndex((row) => y <= row.bottom)
  const row = rows[index]!
  const free = (slot: DropSlot & { path: string }): DropSlot | null =>
    isDragged(slot.path) ? null : slot
  if (y >= row.top)
    return free({ path: row.path, position: y < (row.top + row.bottom) / 2 ? 'before' : 'after' })
  const before = free({ path: row.path, position: 'before' })
  const previous = rows[index - 1]
  if (!previous) return before
  const after = free({ path: previous.path, position: 'after' })
  const nearerAbove = y < (previous.bottom + row.top) / 2
  return nearerAbove ? (after ?? before) : (before ?? after)
}
