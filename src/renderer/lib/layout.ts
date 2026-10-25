/** The least the editor keeps, in pixels: a column of text that can still be written in. */
export const EDITOR_MIN = 420

export interface Column {
  /** The width the writer chose. */
  width: number
  /** The least the column is useful at. */
  min: number
}

/**
 * Fits the sidebar's columns and the right sidebar into a window: the editor keeps `EDITOR_MIN`, the
 * columns give way for it, each down to its own least and in proportion to what it can give, and
 * when even that is not enough the right sidebar leaves (`right` is null). What the writer chose is
 * kept elsewhere, so a wider window brings the chosen widths back. Pure, for tests.
 */
export function fitColumns(
  windowWidth: number,
  left: readonly Column[],
  right: Column | null,
): { left: number[]; right: number | null } {
  const room = Math.max(0, windowWidth - EDITOR_MIN)
  const shrink = (columns: readonly Column[], budget: number): number[] | null => {
    const total = columns.reduce((sum, c) => sum + c.width, 0)
    if (total <= budget) return columns.map((c) => c.width)
    const slack = columns.reduce((sum, c) => sum + (c.width - c.min), 0)
    const excess = total - budget
    if (excess > slack) return null
    return columns.map((c) => Math.round(c.width - ((c.width - c.min) / slack) * excess))
  }
  const both = shrink([...left, ...(right ? [right] : [])], room)
  if (both) return { left: both.slice(0, left.length), right: right ? both[left.length]! : null }
  // The right sidebar goes first; the columns of the left are never dropped, but kept at their least.
  return { left: shrink(left, room) ?? left.map((c) => c.min), right: null }
}
