import { redo, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import type { AppMenu, AppMenuItem } from '@shared/menu'
import { i18n } from '../i18n/i18n.svelte'
import type { MessageKey } from '../i18n/translate'
import { editor } from '../features/editor/editorSession.svelte'
import { allCommands } from './commands'
import type { Command } from './commands'
import { isMac, toAccelerator } from './shortcut'
import { ui } from './ui.svelte'

/**
 * The menu bar on macOS: every command of the app in the places a Mac user looks for it (Ablage,
 * Bearbeiten, Format, Einfügen, Darstellung, Fenster, Hilfe). It is described here, from the same
 * commands the palette lists, and sent to the main process whenever a label, a state or the
 * language changes; a chosen item comes back as its command's id. The keys stay the page's: a
 * shortcut reaches the menu only when the page did not handle it.
 */

type Role = NonNullable<AppMenuItem['role']>

type Entry =
  | 'separator'
  /** A command; `checked` makes it a checkbox, `radio` one of a group. */
  | { command: string; label?: MessageKey; checked?: () => boolean; radio?: boolean }
  /** One of the system's own items, with the label in the app's language. */
  | { role: Role; label: () => string }
  | { submenu: MessageKey; entries: Entry[] }

const appName = (): string => document.title || 'Ezetta'

/** Undo and redo of the place being typed in: an editor's own history, or the field's. */
const UNDO = 'menu-undo'
const REDO = 'menu-redo'

function layout(): { label: MessageKey | 'app'; role?: 'window' | 'help'; entries: Entry[] }[] {
  const name = { name: appName() }
  return [
    {
      label: 'app',
      entries: [
        { command: 'about' },
        'separator',
        { command: 'settings' },
        'separator',
        { role: 'services', label: () => i18n.t('menu.app.services') },
        'separator',
        { role: 'hide', label: () => i18n.t('menu.app.hide', name) },
        { role: 'hideOthers', label: () => i18n.t('menu.app.hideOthers') },
        { role: 'unhide', label: () => i18n.t('menu.app.unhide') },
        'separator',
        { role: 'quit', label: () => i18n.t('menu.app.quit', name) },
      ],
    },
    {
      label: 'menu.file',
      entries: [
        { command: 'newProject' },
        { command: 'openProject' },
        { command: 'closeProject' },
        'separator',
        { command: 'newSheet' },
        { command: 'newGroup' },
        'separator',
        { command: 'history' },
        'separator',
        { command: 'export' },
      ],
    },
    {
      label: 'menu.edit',
      entries: [
        { command: UNDO, label: 'menu.undo' },
        { command: REDO, label: 'menu.redo' },
        'separator',
        { role: 'cut', label: () => i18n.t('menu.cut') },
        { role: 'copy', label: () => i18n.t('menu.copy') },
        { role: 'paste', label: () => i18n.t('menu.paste') },
        { role: 'selectAll', label: () => i18n.t('menu.selectAll') },
        'separator',
        {
          submenu: 'menu.find',
          entries: [
            { command: 'find' },
            { command: 'findReplace' },
            { command: 'findNext' },
            { command: 'findPrevious' },
          ],
        },
      ],
    },
    {
      label: 'menu.format',
      entries: [
        { command: 'editor-strong' },
        { command: 'editor-emphasis' },
        { command: 'editor-highlight' },
        'separator',
        { command: 'editor-subscript' },
        { command: 'editor-superscript' },
        { command: 'editor-smallcaps' },
        'separator',
        { command: 'editor-link' },
        'separator',
        {
          submenu: 'menu.paragraph',
          entries: [
            { command: 'editor-style-text' },
            { command: 'editor-style-heading-1' },
            { command: 'editor-style-heading-2' },
            { command: 'editor-style-heading-3' },
            { command: 'editor-style-heading-4' },
            'separator',
            { command: 'editor-style-bullet' },
            { command: 'editor-style-numbered' },
            'separator',
            { command: 'editor-style-quote' },
            { command: 'editor-style-epigraph' },
          ],
        },
        { command: 'editor-quote-inline' },
      ],
    },
    {
      label: 'menu.insert',
      entries: [
        { command: 'editor-footnote' },
        { command: 'editor-citation' },
        { command: 'editor-cross-reference' },
        'separator',
        { command: 'editor-figure' },
        { command: 'editor-inline-image' },
        { command: 'editor-table' },
        'separator',
        { command: 'editor-formula' },
        { command: 'editor-formula-display' },
        'separator',
        { command: 'editor-comment' },
      ],
    },
    {
      label: 'menu.view',
      entries: [
        { command: 'toggleGroups', label: 'menu.groups', checked: () => ui.groupsVisible },
        { command: 'toggleSheets', label: 'menu.sheets', checked: () => ui.sheetsVisible },
        { command: 'toggleOutline', label: 'menu.outline', checked: () => ui.outlineVisible },
        'separator',
        { command: 'sidebar', label: 'menu.sidebar', checked: () => ui.rightSidebarVisible },
        { command: 'literatureShow' },
        { command: 'proofShow' },
        { command: 'statsShow' },
        'separator',
        { command: 'showSource', label: 'menu.source', checked: () => ui.showSource },
        'separator',
        { role: 'togglefullscreen', label: () => i18n.t('menu.fullscreen') },
      ],
    },
    {
      label: 'menu.window',
      role: 'window',
      entries: [
        { role: 'minimize', label: () => i18n.t('menu.minimize') },
        { role: 'zoom', label: () => i18n.t('menu.zoom') },
        'separator',
        { role: 'front', label: () => i18n.t('menu.front') },
      ],
    },
    {
      // Without items of its own: macOS puts its search of the menu items in this menu.
      label: 'menu.help',
      role: 'help',
      entries: [],
    },
  ]
}

/** The menu bar as it is now: labels in the app's language, each command enabled or not. */
export function describeAppMenu(): AppMenu {
  const commands: readonly Command[] = allCommands()
  const item = (entry: Entry): AppMenuItem | null => {
    if (entry === 'separator') return { type: 'separator' }
    if ('role' in entry) return { role: entry.role, label: entry.label() }
    if ('submenu' in entry)
      return {
        label: i18n.t(entry.submenu),
        submenu: entry.entries.map(item).filter((i): i is AppMenuItem => i !== null),
      }
    if (entry.command === UNDO || entry.command === REDO)
      return {
        id: entry.command,
        label: i18n.t(entry.label!),
        accelerator: entry.command === UNDO ? 'CmdOrCtrl+Z' : 'CmdOrCtrl+Shift+Z',
      }
    const command = commands.find((c) => c.id === entry.command)
    if (!command) return null
    return {
      id: command.id,
      label: entry.label ? i18n.t(entry.label) : command.label(),
      enabled: command.available?.() ?? true,
      ...(entry.checked
        ? { type: entry.radio ? 'radio' : 'checkbox', checked: entry.checked() }
        : {}),
      ...(command.shortcut ? { accelerator: toAccelerator(command.shortcut) } : {}),
    }
  }
  return {
    menus: layout().map((top) => ({
      label: top.label === 'app' ? appName() : i18n.t(top.label),
      ...(top.role ? { role: top.role } : {}),
      items: top.entries.map(item).filter((i): i is AppMenuItem => i !== null),
    })),
  }
}

/** A field outside the editors (a dialog's input) has the focus: text commands are not for it. */
function typingElsewhere(): boolean {
  const active = document.activeElement
  if (!active || active === document.body) return false
  return (
    !active.closest('.cm-editor') && active.matches('input, textarea, select, [contenteditable]')
  )
}

/** Runs what was chosen in the menu bar (or a shortcut the page left to it). */
export function runMenuCommand(id: string): void {
  if (id === UNDO || id === REDO) {
    const host = document.activeElement?.closest<HTMLElement>('.cm-editor')
    const view = host ? EditorView.findFromDOM(host) : null
    if (view) (id === UNDO ? undo : redo)(view)
    else document.execCommand(id === UNDO ? 'undo' : 'redo')
    return
  }
  const command = allCommands().find((c) => c.id === id)
  if (!command || !(command.available?.() ?? true)) return
  // A text command acts on the sheet, never on a field of a dialog that happens to have the focus.
  if (command.id.startsWith('editor-') && (typingElsewhere() || !editor.view)) return
  command.run()
}

/** Keeps the menu bar in step with the app (macOS only). Returns a function that stops it. */
export function initAppMenu(): () => void {
  if (!isMac()) return () => undefined
  const off = window.api.on.app.menuCommand(({ id }) => runMenuCommand(id))
  let last = ''
  const stop = $effect.root(() => {
    $effect(() => {
      const menu = describeAppMenu()
      const json = JSON.stringify(menu)
      if (json === last) return
      last = json
      void window.api.app.setMenu(menu)
    })
  })
  return () => {
    stop()
    off()
  }
}
