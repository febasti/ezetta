export type Theme = 'light' | 'dark' | 'sepia'

export const THEMES: readonly Theme[] = ['light', 'dark', 'sepia']

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.find((candidate) => candidate === value) ?? fallback
  } catch {
    return fallback
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not persisted; applies for this session only
  }
}

/** The themes the writer can choose from; the others stay defined but are not offered yet. */
export const OFFERED_THEMES: readonly Theme[] = ['light', 'dark']

const initialTheme = stored(
  'theme',
  THEMES,
  matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
)
let theme = $state<Theme>(initialTheme)

/** The window's own parts (traffic lights, native menus) take the theme too; the gallery has no window. */
const tellWindow = (next: Theme): void =>
  void (window as { api?: Window['api'] }).api?.app.setAppearance({ theme: next })

const root = document.documentElement
root.dataset['theme'] = initialTheme
tellWindow(initialTheme)

export const appearance = {
  get theme(): Theme {
    return theme
  },
  set theme(next: Theme) {
    theme = next
    root.dataset['theme'] = next
    persist('theme', next)
    tellWindow(next)
  },
}
