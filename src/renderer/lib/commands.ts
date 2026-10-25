import { i18n } from '../i18n/i18n.svelte'
import { project } from '../features/sidebar/project.svelte'
import { editor } from '../features/editor/editorSession.svelte'
import { exporting } from '../features/export/export.svelte'
import { history } from '../features/history/history.svelte'
import { settings } from '../features/settings/settings.svelte'
import { search } from '../features/editor/search.svelte'
import { editorCommands } from '../features/editor/editorCommands'
import {
  setGroupsVisible,
  showRightTab,
  toggleRightSidebar,
  setShowSource,
  setSheetsVisible,
  setOutlineVisible,
  ui,
} from './ui.svelte'
import { keybindings } from './keybindings.svelte'
import { matches, shortcutLabel } from './shortcut'
import type { Shortcut } from './shortcut'

export { matches, shortcutLabel }
export type { Shortcut }

export interface Command {
  id: string
  label: () => string
  /** The shortcut it has now: the writer's choice, else its default. */
  shortcut?: Shortcut | undefined
  /** The shortcut it comes with. */
  defaultShortcut?: Shortcut | undefined
  /** Inactive when false (and left out of the menus). */
  available?: () => boolean
  /** The editor binds this shortcut itself (CodeMirror keymap), so the window must not. */
  inEditor?: boolean
  run: () => void
}

const hasProject = (): boolean => project.snapshot !== null
const canEdit = (): boolean => project.mode === 'editor' && editor.path !== null

/**
 * Every action, with its shortcut. The shell binds the keys. The
 * shortcuts written below are the defaults; the writer can change each one, and what
 * comes out of here has the shortcut as it is now.
 */
export function allCommands(): Command[] {
  return withBindings(defaultCommands())
}

/** The shortcut a command has now, by its id. */
export const commandShortcut = (id: string): Shortcut | undefined =>
  allCommands().find((command) => command.id === id)?.shortcut

function withBindings(commands: Command[]): Command[] {
  return commands.map((command) => ({
    ...command,
    defaultShortcut: command.shortcut,
    shortcut: keybindings.of(command.id, command.shortcut),
  }))
}

function defaultCommands(): Command[] {
  return [
    {
      id: 'settings',
      label: () => i18n.t('settings.open'),
      shortcut: { key: ',' },
      run: () => settings.show(),
    },
    {
      id: 'about',
      label: () => i18n.t('menu.app.about', { name: i18n.t('app.title') }),
      run: () => settings.show('about'),
    },
    {
      id: 'newSheet',
      label: () => i18n.t('cmd.newSheet'),
      shortcut: { key: 'n' },
      available: hasProject,
      run: () => void project.createSheet(),
    },
    {
      id: 'newGroup',
      label: () => i18n.t('cmd.newGroup'),
      shortcut: { key: 'n', shift: true },
      available: hasProject,
      run: () => void project.createGroup(),
    },
    {
      id: 'toggleGroups',
      label: () => i18n.t('cmd.toggleGroups'),
      shortcut: { key: '1' },
      available: hasProject,
      run: () => setGroupsVisible(!ui.groupsVisible),
    },
    {
      id: 'toggleSheets',
      label: () => i18n.t('cmd.toggleSheets'),
      shortcut: { key: '2' },
      available: hasProject,
      run: () => setSheetsVisible(!ui.sheetsVisible),
    },
    {
      id: 'toggleOutline',
      label: () => i18n.t('cmd.outline'),
      shortcut: { key: '3' },
      available: hasProject,
      run: () => setOutlineVisible(!ui.outlineVisible),
    },
    {
      id: 'showSource',
      label: () => i18n.t('cmd.showSource'),
      shortcut: { key: 'u', shift: true },
      available: hasProject,
      run: () => setShowSource(!ui.showSource),
    },
    {
      id: 'sidebar',
      label: () => i18n.t('cmd.sidebar'),
      available: hasProject,
      run: toggleRightSidebar,
    },
    {
      id: 'literatureShow',
      label: () => i18n.t('cmd.literatureShow'),
      available: hasProject,
      run: () => showRightTab('literature'),
    },
    {
      id: 'statsShow',
      label: () => i18n.t('cmd.statsShow'),
      available: hasProject,
      run: () => showRightTab('stats'),
    },
    {
      id: 'proofShow',
      label: () => i18n.t('cmd.proofShow'),
      available: hasProject,
      run: () => showRightTab('proof'),
    },
    {
      id: 'find',
      label: () => i18n.t('cmd.find'),
      shortcut: { key: 'f' },
      available: canEdit,
      run: () => search.show(),
    },
    {
      id: 'findReplace',
      label: () => i18n.t('cmd.findReplace'),
      shortcut: { key: 'r', shift: true },
      available: canEdit,
      run: () => search.show(true),
    },
    {
      id: 'findNext',
      label: () => i18n.t('cmd.findNext'),
      shortcut: { key: 'g' },
      available: canEdit,
      run: () => search.next(true),
    },
    {
      id: 'findPrevious',
      label: () => i18n.t('cmd.findPrevious'),
      shortcut: { key: 'g', shift: true },
      available: canEdit,
      run: () => search.next(false),
    },
    ...editorCommands.map((command): Command => ({
      id: `editor-${command.id}`,
      label: command.label,
      ...(command.defaultShortcut ? { shortcut: command.defaultShortcut } : {}),
      available: canEdit,
      inEditor: true,
      run: () => editor.run(command.id),
    })),
    {
      id: 'openProject',
      label: () => i18n.t('project.open'),
      shortcut: { key: 'o' },
      run: () => void project.openProject(),
    },
    {
      id: 'newProject',
      label: () => i18n.t('project.new'),
      run: () => void project.createProject(),
    },
    {
      id: 'closeProject',
      label: () => i18n.t('project.close'),
      available: hasProject,
      run: () => void project.closeProject(),
    },
    {
      id: 'export',
      label: () => i18n.t('project.export'),
      shortcut: { key: 'e', shift: true },
      available: hasProject,
      run: () => void exporting.show(),
    },
    {
      id: 'history',
      label: () => i18n.t('history.menu'),
      available: hasProject,
      run: () => void history.show(),
    },
  ]
}

/** Case-insensitive match where every word of the query must occur in the text. */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.normalize('NFC').toLowerCase()
  return query
    .normalize('NFC')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/** The kinds of command, in the order the shortcut list shows them. */
export const COMMAND_GROUPS = [
  'general',
  'view',
  'search',
  'text',
  'paragraph',
  'insert',
  'check',
  'export',
] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

const GROUP_OF: Record<string, CommandGroup> = {
  toggleGroups: 'view',
  toggleSheets: 'view',
  toggleOutline: 'view',
  showSource: 'view',
  sidebar: 'view',
  literatureShow: 'view',
  statsShow: 'view',
  find: 'search',
  findReplace: 'search',
  findNext: 'search',
  findPrevious: 'search',
  proofShow: 'check',
  export: 'export',
  'editor-undo': 'text',
  'editor-redo': 'text',
  'editor-emphasis': 'text',
  'editor-strong': 'text',
  'editor-highlight': 'text',
  'editor-subscript': 'text',
  'editor-superscript': 'text',
  'editor-smallcaps': 'text',
  'editor-comment': 'text',
  'editor-link': 'text',
  'editor-footnote': 'insert',
  'editor-figure': 'insert',
  'editor-inline-image': 'insert',
  'editor-citation': 'insert',
  'editor-cross-reference': 'insert',
  'editor-table': 'insert',
  'editor-formula': 'insert',
  'editor-formula-display': 'insert',
  'editor-quote-inline': 'insert',
}

/** Where a command is listed among the shortcuts: by what it does. */
export function commandGroup(id: string): CommandGroup {
  if (id.startsWith('editor-style-')) return 'paragraph'
  return GROUP_OF[id] ?? 'general'
}
