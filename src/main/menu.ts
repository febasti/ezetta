import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { AppMenu, AppMenuItem } from '@shared/menu'

/**
 * The menu bar. Windows and Linux get none. On macOS the app has a full menu bar: the renderer describes it from its commands (`app.setMenu`), and this
 * builds it. Until the renderer has done so, a minimal one stands in: Cut, Copy, Paste, and Select
 * All reach the page only through a menu, and the settings entry (Cmd+,) asks the renderer to open
 * its window.
 */
export function installApplicationMenu(
  platform: NodeJS.Platform,
  onSettings: () => void = () => undefined,
): void {
  if (platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          // The main process has no i18n layer: the system's language picks the label.
          {
            label: app.getLocale().startsWith('de') ? 'Einstellungen …' : 'Settings …',
            accelerator: 'Command+,',
            click: onSettings,
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        role: 'editMenu',
        submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
      },
      { role: 'windowMenu' },
    ]),
  )
}

/**
 * The Electron template for the menu bar the renderer described. Pure, so it can be tested without
 * a window. A command's shortcut is shown but not registered: the page keeps handling its keys, as
 * it does without the menu, so a key never runs a command twice and a text field keeps its own.
 * The system's items (roles) keep theirs, since Cut, Copy and Paste work only through them.
 */
export function appMenuTemplate(
  menu: AppMenu,
  chosen: (id: string) => void,
): MenuItemConstructorOptions[] {
  const item = (spec: AppMenuItem): MenuItemConstructorOptions => {
    if (spec.type === 'separator') return { type: 'separator' }
    const base: MenuItemConstructorOptions = {
      ...(spec.label !== undefined ? { label: spec.label } : {}),
      ...(spec.enabled !== undefined ? { enabled: spec.enabled } : {}),
    }
    if (spec.submenu) return { ...base, submenu: spec.submenu.map(item) }
    if (spec.role) return { ...base, role: spec.role }
    const type = spec.type ?? 'normal'
    return {
      ...base,
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      type,
      ...(type === 'checkbox' || type === 'radio' ? { checked: spec.checked === true } : {}),
      ...(spec.accelerator ? { accelerator: spec.accelerator, registerAccelerator: false } : {}),
      click: () => {
        if (spec.id !== undefined) chosen(spec.id)
      },
    }
  }
  return menu.menus.map((top) => ({
    label: top.label,
    ...(top.role ? { role: top.role } : {}),
    submenu: top.items.map(item),
  }))
}

/** Sets the menu bar the renderer described; nothing outside macOS. */
export function setApplicationMenu(
  platform: NodeJS.Platform,
  menu: AppMenu,
  chosen: (id: string) => void,
): void {
  if (platform !== 'darwin') return
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(menu, chosen)))
}
