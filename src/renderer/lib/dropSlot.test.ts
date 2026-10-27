import { describe, expect, it } from 'vitest'
import { slotAt } from './dropSlot'
import type { RowSpan } from './dropSlot'

/** Three rows of 50 with a gap of 10 between them: 0-50, 60-110, 120-170. */
const rows: RowSpan[] = [
  { path: 'a', top: 0, bottom: 50 },
  { path: 'b', top: 60, bottom: 110 },
  { path: 'c', top: 120, bottom: 170 },
]
const none = (): boolean => false

describe('slotAt', () => {
  it('splits a row in two: before in its upper half, after in its lower half', () => {
    expect(slotAt(10, rows, none)).toEqual({ path: 'a', position: 'before' })
    expect(slotAt(40, rows, none)).toEqual({ path: 'a', position: 'after' })
    expect(slotAt(75, rows, none)).toEqual({ path: 'b', position: 'before' })
  })

  it('lands somewhere in the gap between rows, by the nearer row', () => {
    expect(slotAt(52, rows, none)).toEqual({ path: 'a', position: 'after' })
    expect(slotAt(58, rows, none)).toEqual({ path: 'b', position: 'before' })
  })

  it('lands before the first row above it and at the end under the last', () => {
    expect(slotAt(-5, rows, none)).toEqual({ path: 'a', position: 'before' })
    expect(slotAt(171, rows, none)).toEqual({ end: true })
    expect(slotAt(400, rows, none)).toEqual({ end: true })
  })

  it('is the end of an empty list', () => {
    expect(slotAt(10, [], none)).toEqual({ end: true })
  })

  it('shows nothing over a row that is being dragged', () => {
    expect(slotAt(75, rows, (path) => path === 'b')).toBeNull()
    expect(slotAt(-5, rows, (path) => path === 'a')).toBeNull()
  })

  it('takes the other side of a gap when the nearer row is being dragged', () => {
    // Near the top of the gap after `a`, which is dragged: the place is before `b`, the same one.
    expect(slotAt(52, rows, (path) => path === 'a')).toEqual({ path: 'b', position: 'before' })
    expect(slotAt(58, rows, (path) => path === 'b')).toEqual({ path: 'a', position: 'after' })
    expect(slotAt(55, rows, () => true)).toBeNull()
  })
})
