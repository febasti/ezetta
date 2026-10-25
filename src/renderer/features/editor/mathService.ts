import type { MathOutcome, MathService } from '../../editor/mathState'

type Render = (source: string, display: boolean) => Promise<MathOutcome>

const MAX_ENTRIES = 400

/**
 * Draws formulas through `render` and remembers the answers, so a formula that is on screen again
 * (scrolling, switching sheets, the same formula twice) needs no new compiler run. The same
 * request made twice at once shares one run. Answers that are only a failure to reach the
 * compiler are not remembered.
 */
export function createMathService(render: Render): MathService {
  const cache = new Map<string, MathOutcome>()
  const running = new Map<string, Promise<MathOutcome>>()
  const keyOf = (source: string, display: boolean): string =>
    `${display ? 'd' : 'i'}\u0000${source}`
  /** The remembered answer, which is now the most recently used (the least recently used goes first). */
  const recall = (key: string): MathOutcome | undefined => {
    const hit = cache.get(key)
    if (hit) {
      cache.delete(key)
      cache.set(key, hit)
    }
    return hit
  }

  return {
    peek(source, display) {
      return recall(keyOf(source, display))
    },
    get(source, display) {
      const key = keyOf(source, display)
      const hit = recall(key)
      if (hit) return Promise.resolve(hit)
      const existing = running.get(key)
      if (existing) return existing
      const job = render(source, display)
        .catch((): MathOutcome => ({
          ok: false,
          reason: 'unavailable',
          message: 'Could not draw the formula',
        }))
        .then((outcome) => {
          running.delete(key)
          if (outcome.ok || outcome.reason === 'invalid' || outcome.reason === 'code') {
            cache.set(key, outcome)
            if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
          }
          return outcome
        })
      running.set(key, job)
      return job
    },
  }
}

/** The editor's formula service: the Typst compiler in the main process, behind the IPC contract. */
export const mathService: MathService = createMathService(async (source, display) => {
  const result = await window.api.project.renderMath({ source, display })
  return result.ok
    ? result.value
    : { ok: false, reason: 'unavailable', message: result.error.message }
})
