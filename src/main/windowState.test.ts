import { describe, expect, it } from 'vitest'
import { DEFAULT_SIZE, MIN_SIZE, placeWindow } from './windowState'

const main = { x: 0, y: 25, width: 1440, height: 875 }
const right = { x: 1440, y: 0, width: 1920, height: 1080 }

describe('placeWindow', () => {
  it('opens at the default size the first time', () => {
    expect(placeWindow(null, [main])).toEqual({ bounds: DEFAULT_SIZE, maximized: false })
  })

  it('opens where the window was, on that screen', () => {
    const saved = { x: 1600, y: 100, width: 1200, height: 800, maximized: false }
    expect(placeWindow(saved, [main, right]).bounds).toEqual({
      x: 1600,
      y: 100,
      width: 1200,
      height: 800,
    })
  })

  it('falls back to the default size when that screen is gone, and keeps maximized', () => {
    const saved = { x: 1600, y: 100, width: 1000, height: 700, maximized: true }
    expect(placeWindow(saved, [main])).toEqual({ bounds: DEFAULT_SIZE, maximized: true })
  })

  it('keeps a window that hangs over an edge on the screen, and within its size limits', () => {
    const saved = { x: 1000, y: 30, width: 2000, height: 300, maximized: false }
    expect(placeWindow(saved, [main]).bounds).toEqual({
      x: 0,
      y: 30,
      width: 1440,
      height: MIN_SIZE.height,
    })
  })
})
