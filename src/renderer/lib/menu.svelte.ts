import type { MenuSpecItem } from '@shared/menu'
import type { Shortcut } from './shortcut'
import { toAccelerator } from './shortcut'

export interface MenuItem {
  label?: string
  onselect?: () => void
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  separator?: boolean
  /** The shortcut shown beside the label in a system menu. */
  shortcut?: Shortcut
  /** The system's own cut, copy, paste, … on the page. `onselect` is what the app's own menu does. */
  role?: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
  /** A menu inside the item: one level only. */
  submenu?: MenuItem[]
}

/** One menu at a time, shared by context menus and dropdowns. */
export const menuState = $state<{
  current: { x: number; y: number; items: MenuItem[]; opener: HTMLElement | null } | null
}>({
  current: null,
})

export function openMenuAt(
  x: number,
  y: number,
  items: MenuItem[],
  opener: HTMLElement | null = null,
): void {
  menuState.current = { x, y, items, opener }
}

/** The description of a menu for the main process, and the item each id stands for. */
function describe(items: MenuItem[]): { spec: MenuSpecItem[]; byId: Record<string, MenuItem> } {
  const byId: Record<string, MenuItem> = {}
  const one = (item: MenuItem, id: string): MenuSpecItem => {
    if (item.separator) return { type: 'separator' }
    byId[id] = item
    return {
      id,
      type: item.checked !== undefined ? 'checkbox' : 'normal',
      ...(item.label !== undefined ? { label: item.label } : {}),
      ...(item.disabled ? { enabled: false } : {}),
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
      ...(item.role ? { role: item.role } : {}),
      ...(item.shortcut ? { accelerator: toAccelerator(item.shortcut) } : {}),
    }
  }
  const spec = items.map((item, i): MenuSpecItem => {
    const described = one(item, String(i))
    return item.submenu
      ? { ...described, submenu: item.submenu.map((sub, j) => one(sub, `${i}.${j}`)) }
      : described
  })
  return { spec, byId }
}

/** The app's own menu cannot nest: a submenu's items follow, named after it. */
function flatten(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) =>
    item.submenu
      ? item.submenu.map((sub) => ({ ...sub, label: `${item.label ?? ''} › ${sub.label ?? ''}` }))
      : [item],
  )
}

/**
 * Shows a context menu as the system's own, and does what the item chosen says. Where the system
 * cannot show one (tests, or a failure), the app draws its own.
 */
export async function popupContextMenu(
  x: number,
  y: number,
  items: MenuItem[],
  opener: HTMLElement | null = null,
): Promise<void> {
  const { spec, byId } = describe(items)
  let answer: { native: boolean; id: string | null } | null = null
  try {
    const result = await window.api.app.popupMenu({ items: spec, x, y })
    if (result.ok) answer = result.value
  } catch {
    answer = null
  }
  if (!answer?.native) return openMenuAt(x, y, flatten(items), opener)
  if (answer.id !== null) byId[answer.id]?.onselect?.()
}

export function openContextMenu(event: MouseEvent, items: MenuItem[]): void {
  event.preventDefault()
  void popupContextMenu(
    event.clientX,
    event.clientY,
    items,
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  )
}

/** Opens a dropdown just below a button. */
export function openDropdown(button: HTMLElement, items: MenuItem[]): void {
  const rect = button.getBoundingClientRect()
  openMenuAt(rect.left, rect.bottom + 2, items, button)
}

export function closeMenu(): void {
  const opener = menuState.current?.opener
  menuState.current = null
  opener?.focus?.()
}
