/**
 * The zoom of the export preview: how large its pages are drawn. A factor of 1 is a page at its real
 * size, a point being 4/3 of a CSS pixel (A4 is 794 pixels wide); the two fits follow the room the
 * pages have.
 */
import type { PreviewZoom } from '../../lib/ui.svelte'

export const PX_PER_PT = 4 / 3
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
/** The steps the buttons and keys go through, and the factors the menu offers. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export interface Size {
  width: number
  height: number
}

export const clampZoom = (factor: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor))

/**
 * The factor a zoom stands for in a room of `room` pixels for the pages (without the space around
 * them): its own, the widest page across the room, or the tallest page whole in it as well. A fit is
 * not held to the steps' limits, only kept from vanishing.
 */
export function scaleOf(zoom: PreviewZoom, pages: readonly Size[], room: Size): number {
  if (typeof zoom === 'number') return clampZoom(zoom)
  if (pages.length === 0 || room.width <= 0) return 1
  const widest = Math.max(...pages.map((p) => p.width)) * PX_PER_PT
  const across = room.width / widest
  if (zoom === 'width') return Math.max(0.05, across)
  const tallest = Math.max(...pages.map((p) => p.height)) * PX_PER_PT
  return Math.max(0.05, Math.min(across, room.height > 0 ? room.height / tallest : across))
}

/** The next step up (1) or down (-1) from a factor, which need not be a step itself. */
export function stepZoom(factor: number, direction: 1 | -1): number {
  const near = 0.005
  if (direction === 1) return ZOOM_STEPS.find((s) => s > factor + near) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((s) => s < factor - near) ?? MIN_ZOOM
}

/**
 * The page a point lies on, from the tops of the pages in order: the last page that starts at or
 * above it (the first page for a point above every page).
 */
export function pageAt(tops: readonly number[], y: number): number {
  let low = 0
  let high = tops.length - 1
  if (high < 0) return 0
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (tops[mid]! <= y) low = mid
    else high = mid - 1
  }
  return low
}

/** The heading the view is in: the last one that starts at or above the point (page counted from 1, y in pixels from its top), or -1. */
export function headingAt(
  entries: readonly { page: number; y: number }[],
  page: number,
  y: number,
): number {
  let found = -1
  for (const [i, entry] of entries.entries()) {
    if (entry.page < page || (entry.page === page && entry.y <= y)) found = i
    else break
  }
  return found
}
