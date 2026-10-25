import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autosaver } from './autosave'
import type { SaveState } from './autosave'

let writes: [string, string][]
let states: SaveState[]
let fail: boolean
let gate: Promise<void> | null

function make(): Autosaver {
  return new Autosaver({
    write: async (path, content) => {
      if (gate) await gate
      if (fail) return false
      writes.push([path, content])
      return true
    },
    onState: (s) => states.push(s),
    delayMs: 800,
    retryMs: 3000,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  writes = []
  states = []
  fail = false
  gate = null
})
afterEach(() => vi.useRealTimers())

describe('Autosaver', () => {
  it('debounces: many edits become one write with the latest text', async () => {
    const saver = make()
    let text = 'a'
    saver.edit('x.typ', () => text)
    text = 'ab'
    await vi.advanceTimersByTimeAsync(500)
    saver.edit('x.typ', () => text)
    text = 'abc'
    await vi.advanceTimersByTimeAsync(799)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toEqual([['x.typ', 'abc']])
    expect(states).toEqual(['unsaved', 'saving', 'saved'])
  })

  it('flush writes immediately and resolves after the write', async () => {
    const saver = make()
    saver.edit('x.typ', () => 'text')
    await saver.flush()
    expect(writes).toEqual([['x.typ', 'text']])
    expect(saver.state).toBe('saved')
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toHaveLength(1)
  })

  it('flush with nothing pending resolves and writes nothing', async () => {
    const saver = make()
    await saver.flush()
    expect(writes).toEqual([])
  })

  it('keeps text pending after a failure and retries until it works', async () => {
    const saver = make()
    fail = true
    saver.edit('x.typ', () => 'text')
    await vi.advanceTimersByTimeAsync(800)
    expect(saver.state).toBe('error')
    expect(saver.hasPending).toBe(true)
    fail = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(writes).toEqual([['x.typ', 'text']])
    expect(saver.state).toBe('saved')
  })

  it('treats a throwing write as a failure', async () => {
    const saver = new Autosaver({
      write: async () => {
        throw new Error('boom')
      },
      onState: () => undefined,
    })
    saver.edit('x.typ', () => 't')
    await saver.flush()
    expect(saver.state).toBe('error')
    expect(saver.hasPending).toBe(true)
  })

  it('never overlaps writes and does not lose an edit made during a write', async () => {
    const saver = make()
    let release!: () => void
    gate = new Promise<void>((r) => (release = r))
    let text = 'one'
    saver.edit('x.typ', () => text)
    const first = saver.flush()
    text = 'two'
    saver.edit('x.typ', () => text)
    release()
    gate = null
    await first
    await saver.flush()
    expect(writes.at(-1)).toEqual(['x.typ', 'two'])
    expect(saver.state).toBe('saved')
  })

  it('flushes the previous sheet before accepting edits for another', async () => {
    const saver = make()
    saver.edit('a.typ', () => 'A')
    saver.edit('b.typ', () => 'B')
    await saver.flush()
    expect(writes).toEqual([
      ['a.typ', 'A'],
      ['b.typ', 'B'],
    ])
  })

  it('pause stops timer saves but keeps the edit, and flush still writes it', async () => {
    const saver = make()
    saver.edit('x.typ', () => 'mine')
    saver.pause()
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toEqual([])
    expect(saver.hasPending).toBe(true)
    await saver.flush()
    expect(writes).toEqual([['x.typ', 'mine']])
  })

  it('flush with respectPause writes nothing while paused', async () => {
    const saver = make()
    saver.edit('x.typ', () => 'mine')
    saver.pause()
    await saver.flush({ respectPause: true })
    expect(writes).toEqual([])
    expect(saver.hasPending).toBe(true)
  })

  it('resume schedules the pending edit again', async () => {
    const saver = make()
    saver.edit('x.typ', () => 'mine')
    saver.pause()
    saver.edit('x.typ', () => 'mine 2')
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toEqual([])
    saver.resume()
    await vi.advanceTimersByTimeAsync(800)
    expect(writes).toEqual([['x.typ', 'mine 2']])
  })

  it('discard drops pending text', async () => {
    const saver = make()
    saver.edit('x.typ', () => 'text')
    saver.discard()
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toEqual([])
    expect(saver.state).toBe('saved')
  })
})
