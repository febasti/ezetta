import { describe, expect, it, vi } from 'vitest'
import type { MathOutcome } from '../../editor/mathState'
import { createMathService } from './mathService'

const drawn = (source: string): MathOutcome => ({
  ok: true,
  svg: `<svg>${source}</svg>`,
  width: 1,
  height: 1,
  baseline: null,
})

describe('the formula service', () => {
  it('draws a formula once, and shares a run asked for twice at once', async () => {
    const render = vi.fn(async (source: string) => drawn(source))
    const service = createMathService(render)
    const [a, b] = await Promise.all([service.get('x', false), service.get('x', false)])
    expect(a).toEqual(drawn('x'))
    expect(b).toBe(a)
    expect(await service.get('x', false)).toBe(a)
    expect(service.peek('x', false)).toBe(a)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('keeps a formula that is asked for again, and lets the least recently used go', async () => {
    const render = vi.fn(async (source: string) => drawn(source))
    const service = createMathService(render)
    await service.get('first', false)
    for (let i = 0; i < 399; i += 1) {
      await service.get(`f${i}`, false)
      // The first formula is in use all along: on screen, it is asked for with every redraw.
      await service.get('first', false)
    }
    await service.get('one more', false) // the cache is full: one formula has to go
    expect(service.peek('first', false)).toEqual(drawn('first'))
    expect(service.peek('f0', false)).toBeUndefined()
  })

  it('does not remember that the compiler could not be reached', async () => {
    const render = vi.fn(async (): Promise<MathOutcome> => {
      throw new Error('no compiler')
    })
    const service = createMathService(render)
    expect((await service.get('x', false)).ok).toBe(false)
    expect(service.peek('x', false)).toBeUndefined()
    await service.get('x', false)
    expect(render).toHaveBeenCalledTimes(2)
  })
})
