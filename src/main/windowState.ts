import type { WindowState } from './services/settings'

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_SIZE = { width: 1280, height: 800 }
/** The small window of the welcome page, while no project is open. */
export const LAUNCHER_SIZE = { width: 720, height: 440 }
/** Smaller than this the columns, the toolbar and the text no longer fit together. */
export const MIN_SIZE = { width: 1100, height: 700 }
/** How much of the window's title area must be on a screen for the saved place to count. */
const VISIBLE = 120

/**
 * Where the window opens: where it was last time, if that place is still on one of the screens
 * (a screen may have been unplugged since), at least the size the window allows and no larger
 * than that screen; otherwise the default size, placed by the system. Pure, for tests.
 */
export function placeWindow(
  saved: WindowState | null,
  screens: readonly Area[],
): { bounds: Partial<Area> & { width: number; height: number }; maximized: boolean } {
  if (!saved) return { bounds: { ...DEFAULT_SIZE }, maximized: false }
  const screen = screens.find(
    (s) =>
      saved.x + VISIBLE <= s.x + s.width &&
      saved.x + saved.width - VISIBLE >= s.x &&
      saved.y >= s.y &&
      saved.y + VISIBLE / 2 <= s.y + s.height,
  )
  if (!screen) return { bounds: { ...DEFAULT_SIZE }, maximized: saved.maximized }
  const width = Math.min(Math.max(saved.width, MIN_SIZE.width), screen.width)
  const height = Math.min(Math.max(saved.height, MIN_SIZE.height), screen.height)
  return {
    bounds: {
      x: Math.min(Math.max(saved.x, screen.x), screen.x + screen.width - width),
      y: Math.min(Math.max(saved.y, screen.y), screen.y + screen.height - height),
      width,
      height,
    },
    maximized: saved.maximized,
  }
}
