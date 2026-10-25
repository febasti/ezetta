import { parseShortcut, sameShortcut } from './shortcut'
import type { Shortcut } from './shortcut'

/**
 * The shortcuts the writer has chosen for the app's commands, over the defaults the
 * commands carry. A command is in here when its shortcut differs from its default: with a new
 * shortcut, or with `null` when the writer took it off. Kept like the other app settings, in the
 * browser storage of the renderer.
 */

const KEY = 'keybindings'

type Overrides = Record<string, Shortcut | null>

function load(): Overrides {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    const out: Overrides = {}
    for (const [id, value] of Object.entries(raw)) {
      if (value === null) out[id] = null
      else {
        const shortcut = parseShortcut(value)
        if (shortcut) out[id] = shortcut
      }
    }
    return out
  } catch {
    return {}
  }
}

function persist(value: Overrides): void {
  try {
    if (Object.keys(value).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // not kept; applies for this session only
  }
}

let overrides = $state<Overrides>(load())

export const keybindings = {
  /** The shortcut a command has now: the writer's choice (which may be none), else its default. */
  of(id: string, fallback: Shortcut | undefined): Shortcut | undefined {
    if (!(id in overrides)) return fallback
    return overrides[id] ?? undefined
  },

  /** Whether the writer changed the command's shortcut. */
  isCustom(id: string): boolean {
    return id in overrides
  },

  get anyCustom(): boolean {
    return Object.keys(overrides).length > 0
  },

  /** Changes at one stroke: what the shortcuts are now, for what has to be made again when they change. */
  get signature(): string {
    return JSON.stringify(overrides)
  },

  /** Sets a command's shortcut (`null` takes it off); a choice that is the default is forgotten. */
  set(id: string, shortcut: Shortcut | null, fallback: Shortcut | undefined): void {
    const next = { ...overrides }
    if (shortcut === null ? fallback === undefined : sameShortcut(shortcut, fallback))
      delete next[id]
    else next[id] = shortcut
    overrides = next
    persist(next)
  },

  reset(id: string): void {
    if (!(id in overrides)) return
    const next = { ...overrides }
    delete next[id]
    overrides = next
    persist(next)
  },

  resetAll(): void {
    overrides = {}
    persist({})
  },
}
