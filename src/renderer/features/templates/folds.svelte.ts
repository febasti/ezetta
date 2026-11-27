/**
 * Which sections of the template's properties are open. A section is remembered by its name, so
 * "Schrift" opened on one heading is open on the next one too; the choice is kept across restarts.
 */
const KEY = 'ui.templateSections'

function stored(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

const folds = $state<{ open: Record<string, boolean> }>({ open: stored() })

/**
 * Whether a section shows its values: as the writer left it, else as it starts (the first of a
 * page and the one with its drawing are open).
 */
export const isOpen = (id: string, start: boolean): boolean => folds.open[id] ?? start

export function setOpen(id: string, open: boolean): void {
  folds.open[id] = open
  try {
    localStorage.setItem(KEY, JSON.stringify(folds.open))
  } catch {
    // not kept; applies for this session only
  }
}
