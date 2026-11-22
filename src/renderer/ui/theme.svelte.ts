export type Theme = 'light' | 'dark' | 'sepia'

export const THEMES: readonly Theme[] = ['light', 'dark', 'sepia']

/** What the writer chooses: a theme, or the system's light or dark appearance, followed as it changes. */
export type ThemeChoice = Theme | 'system'

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

/** The choices the writer is offered; sepia stays defined but is not offered yet. */
export const OFFERED_THEMES: readonly ThemeChoice[] = ['light', 'dark', 'system']

const dark = matchMedia('(prefers-color-scheme: dark)')

/** What the system asks for now. The window follows the system only while the choice is "system"
 * (the main process sets it so), so this is read then, and only then. */
const systemTheme = (): Theme => (dark.matches ? 'dark' : 'light')

const initialChoice = stored<ThemeChoice>('theme', [...THEMES, 'system'], 'system')
let choice = $state<ThemeChoice>(initialChoice)
let theme = $state<Theme>(initialChoice === 'system' ? systemTheme() : initialChoice)

/** The window's own parts (traffic lights, native menus) take the theme too; the gallery has no window. */
const tellWindow = (next: ThemeChoice): void =>
  void (window as { api?: Window['api'] }).api?.app.setAppearance({ theme: next })

const root = document.documentElement
root.dataset['theme'] = theme
tellWindow(initialChoice)

function apply(next: Theme): void {
  theme = next
  root.dataset['theme'] = next
}

// The system turned light or dark (or the window began to follow it): follow, if that is the choice.
dark.addEventListener('change', () => {
  if (choice === 'system') apply(systemTheme())
})

export const appearance = {
  /** The theme the app is drawn in now. */
  get theme(): Theme {
    return theme
  },
  /** Sets a theme of its own (the gallery). */
  set theme(next: Theme) {
    appearance.choice = next
  },
  /** What the writer chose: a theme, or the system's appearance. */
  get choice(): ThemeChoice {
    return choice
  },
  set choice(next: ThemeChoice) {
    choice = next
    persist('theme', next)
    tellWindow(next)
    // Before the window follows the system again, the query still answers for the old theme; its
    // change event brings the right one once it does.
    apply(next === 'system' ? systemTheme() : next)
  },
}
