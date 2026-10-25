export interface IdleStop {
  /** The helper was just used: the wait starts again. */
  touch(): void
  /** No stop is planned any more, until the next `touch`. */
  cancel(): void
}

/**
 * Stops a helper process that has not been used for `ms`, so that it gives its memory back (the
 * spelling checker and the synonyms each run in a Java process of their own). `stop` returns false
 * while the helper is still busy, and the wait then starts again. The timer never keeps the app
 * from quitting.
 */
export function idleStop(ms: number, stop: () => boolean): IdleStop {
  let timer: ReturnType<typeof setTimeout> | undefined
  const touch = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!stop()) touch()
    }, ms)
    timer.unref?.()
  }
  return { touch, cancel: () => clearTimeout(timer) }
}
