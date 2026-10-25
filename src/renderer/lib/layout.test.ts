import { describe, expect, it } from 'vitest'
import { EDITOR_MIN, fitColumns } from './layout'

const col = (width: number, min: number) => ({ width, min })

describe('fitColumns', () => {
  it('leaves the chosen widths when there is room', () => {
    expect(fitColumns(1400, [col(220, 160), col(280, 200)], col(300, 240))).toEqual({
      left: [220, 280],
      right: 300,
    })
  })

  it('narrows the columns in proportion to what they can give, so the editor keeps its width', () => {
    const fitted = fitColumns(1100, [col(300, 160), col(300, 200)], col(300, 240))
    const total = fitted.left.reduce((a, b) => a + b, 0) + fitted.right!
    expect(total).toBeLessThanOrEqual(1100 - EDITOR_MIN + 2)
    fitted.left.forEach((w, i) => expect(w).toBeGreaterThanOrEqual([160, 200][i]!))
    expect(fitted.right).toBeGreaterThanOrEqual(240)
  })

  it('drops the right sidebar when even the least of every column does not leave the editor its width', () => {
    expect(fitColumns(820, [col(220, 160), col(280, 200)], col(300, 240))).toEqual({
      left: [177, 223],
      right: null,
    })
  })

  it('keeps the columns at their least in a window that cannot hold even those', () => {
    expect(fitColumns(500, [col(220, 160), col(280, 200)], null)).toEqual({
      left: [160, 200],
      right: null,
    })
  })

  it('gives the same widths back when the window grows again', () => {
    const columns = [col(220, 160), col(280, 200)]
    fitColumns(800, columns, col(300, 240))
    expect(fitColumns(1600, columns, col(300, 240))).toEqual({ left: [220, 280], right: 300 })
  })
})
