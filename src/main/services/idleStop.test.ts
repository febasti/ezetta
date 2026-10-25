import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { idleStop } from './idleStop'

describe('idleStop', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stops once the time has passed since the last use', () => {
    const stop = vi.fn(() => true)
    const idle = idleStop(1000, stop)
    idle.touch()
    vi.advanceTimersByTime(900)
    idle.touch()
    vi.advanceTimersByTime(900)
    expect(stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(stop).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('waits again while the helper is busy', () => {
    let busy = true
    const stop = vi.fn(() => !busy)
    idleStop(1000, stop).touch()
    vi.advanceTimersByTime(1000)
    expect(stop).toHaveBeenCalledTimes(1)
    busy = false
    vi.advanceTimersByTime(1000)
    expect(stop).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5000)
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('does nothing after it is cancelled', () => {
    const stop = vi.fn(() => true)
    const idle = idleStop(1000, stop)
    idle.touch()
    idle.cancel()
    vi.advanceTimersByTime(5000)
    expect(stop).not.toHaveBeenCalled()
  })
})
