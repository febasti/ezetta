import { describe, expect, it } from 'vitest'
import { headingAt, pageAt, scaleOf, stepZoom } from './previewZoom'

const A4 = { width: 595.28, height: 841.89 }

describe('scaleOf', () => {
  it('takes a factor as it is, within the limits', () => {
    expect(scaleOf(1.5, [A4], { width: 100, height: 100 })).toBe(1.5)
    expect(scaleOf(9, [A4], { width: 100, height: 100 })).toBe(4)
  })

  it('fits the widest page across the room', () => {
    // A4 at its real size is 793.7 pixels wide.
    expect(scaleOf('width', [A4], { width: 793.7, height: 300 })).toBeCloseTo(1, 3)
    const landscape = { width: A4.height, height: A4.width }
    expect(scaleOf('width', [A4, landscape], { width: 561.3, height: 300 })).toBeCloseTo(0.5, 2)
  })

  it('fits the whole page when the room is lower than it is wide', () => {
    expect(scaleOf('page', [A4], { width: 2000, height: 561.3 })).toBeCloseTo(0.5, 2)
    expect(scaleOf('page', [A4], { width: 396.9, height: 5000 })).toBeCloseTo(0.5, 2)
  })

  it('is the real size before there are pages or room', () => {
    expect(scaleOf('width', [], { width: 500, height: 500 })).toBe(1)
    expect(scaleOf('page', [A4], { width: 0, height: 0 })).toBe(1)
  })
})

describe('stepZoom', () => {
  it('goes to the next step, from a step or from between two', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
  })

  it('stops at the ends', () => {
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(0.25, -1)).toBe(0.25)
  })
})

describe('pageAt', () => {
  const tops = [10, 1000, 2000]
  it('is the page that starts at or above the point', () => {
    expect(pageAt(tops, 0)).toBe(0)
    expect(pageAt(tops, 999)).toBe(0)
    expect(pageAt(tops, 1000)).toBe(1)
    expect(pageAt(tops, 5000)).toBe(2)
    expect(pageAt([], 5)).toBe(0)
  })
})

describe('headingAt', () => {
  const entries = [
    { page: 2, y: 100 },
    { page: 2, y: 400 },
    { page: 5, y: 50 },
  ]
  it('is the last heading at or above the point', () => {
    expect(headingAt(entries, 1, 500)).toBe(-1)
    expect(headingAt(entries, 2, 99)).toBe(-1)
    expect(headingAt(entries, 2, 100)).toBe(0)
    expect(headingAt(entries, 3, 0)).toBe(1)
    expect(headingAt(entries, 9, 0)).toBe(2)
  })
})
