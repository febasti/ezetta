import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import type { MenuSpecItem } from '@shared/menu'

/**
 * A context menu drawn by the system: the renderer describes the items, this shows them
 * as the platform's own menu, and the answer is the `id` of the item that was chosen. Items with a
 * role (cut, copy, paste, …) are done by the system on the page and have no answer.
 */

type Chosen = (id: string) => void

/** The Electron template for a described menu. Pure, so it can be tested without a window. */
export function toTemplate(
  items: readonly MenuSpecItem[],
  chosen: Chosen,
): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.type === 'separator') return { type: 'separator' }
    const base: MenuItemConstructorOptions = {
      ...(item.label !== undefined ? { label: item.label } : {}),
      ...(item.enabled !== undefined ? { enabled: item.enabled } : {}),
      ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false } : {}),
    }
    if (item.submenu) return { ...base, submenu: toTemplate(item.submenu, chosen) }
    if (item.role) return { ...base, role: item.role }
    return {
      ...base,
      type: item.type === 'checkbox' ? 'checkbox' : 'normal',
      ...(item.type === 'checkbox' ? { checked: item.checked === true } : {}),
      click: () => {
        if (item.id !== undefined) chosen(item.id)
      },
    }
  })
}

/** Shows the menu and resolves when it closes: with the chosen item's id, or null. */
export function popupNativeMenu(
  window: BrowserWindow,
  items: readonly MenuSpecItem[],
  at: { x: number; y: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    let answer: string | null = null
    const menu = Menu.buildFromTemplate(
      toTemplate(items, (id) => {
        answer = id
      }),
    )
    menu.popup({
      window,
      x: Math.round(at.x),
      y: Math.round(at.y),
      // The click handler runs just before the menu reports that it closed.
      callback: () => resolve(answer),
    })
  })
}
