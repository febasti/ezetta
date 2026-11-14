import { describe, expect, it } from 'vitest'
import { RecentMap } from './recentMap'

describe('RecentMap', () => {
  it('lets go of the least recently used entry when full', () => {
    const map = new RecentMap<string, number>(2)
    map.set('a', 1)
    map.set('b', 2)
    expect(map.get('a')).toBe(1) // a is now newer than b
    map.set('c', 3)
    expect(map.size).toBe(2)
    expect(map.has('b')).toBe(false)
    expect(map.get('a')).toBe(1)
    expect(map.get('c')).toBe(3)
  })

  it('replaces a value without growing', () => {
    const map = new RecentMap<string, number>(2)
    map.set('a', 1)
    map.set('a', 2)
    expect(map.size).toBe(1)
    expect(map.get('a')).toBe(2)
    expect(map.get('missing')).toBeUndefined()
  })
})
