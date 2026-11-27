import { i18n } from '../../i18n/i18n.svelte'
import { commandShortcut } from '../../lib/commands'
import { formatNumber } from '../../lib/format'
import type { MenuItem } from '../../lib/menu.svelte'
import { exporting } from '../export/export.svelte'
import { backup } from '../history/backup.svelte'
import { history } from '../history/history.svelte'
import { settings } from '../settings/settings.svelte'
import { project } from './project.svelte'

/** What the menu says of the backup, where the writer should know: none set up, or out of reach. */
function backupNote(): string | undefined {
  const status = backup.status
  if (!status) return undefined
  if (!status.configured) return i18n.t('statusbar.backup.none')
  if (!status.reachable || status.error) return i18n.t('statusbar.backup.problem')
  return undefined
}

/**
 * The project menu: at its top what the project is and how far it is (its name, its words and its
 * goal as a bar), then what is done with it (export, versions), what is set for it (the word goal,
 * the footnotes' numbering as a switch, its name) and the settings, and last the other projects.
 * What has a place of its own is not repeated here: the title page's fields are in the sidebar, the
 * literature files on the settings' "Projekt" page. It is read again while it is open, so the
 * switch shows what it was turned to.
 */
export function projectMenuItems(): MenuItem[] {
  const snapshot = project.snapshot
  const num = (n: number): string => formatNumber(n, i18n.locale)
  const words = snapshot?.totalWords ?? 0
  const goal = snapshot?.goalWords ?? null
  const chapter = snapshot?.footnoteRestart === 'chapter'
  const note = backupNote()
  return [
    {
      info: {
        title: snapshot?.title ?? '',
        text: goal
          ? i18n.t('project.menu.wordsOfGoal', { count: num(words), goal: num(goal) })
          : i18n.t('statusbar.words', { count: words }),
        ...(goal ? { share: words / goal } : {}),
      },
    },
    { separator: true },
    {
      icon: 'file-export',
      label: i18n.t('project.export'),
      shortcut: commandShortcut('export'),
      onselect: () => void exporting.show(),
    },
    {
      icon: 'history',
      label: i18n.t('history.menu'),
      shortcut: commandShortcut('history'),
      ...(note ? { detail: note } : {}),
      onselect: () => void history.show(),
    },
    { separator: true },
    {
      icon: 'target',
      label: i18n.t('project.menu.goal'),
      detail: goal ? num(goal) : i18n.t('project.menu.noGoal'),
      onselect: () => void project.setGoal(''),
    },
    {
      icon: 'asterisk',
      label: i18n.t('project.footnotesChapter'),
      toggle: true,
      checked: chapter,
      onselect: () => void project.setFootnoteRestart(chapter ? 'continuous' : 'chapter'),
    },
    {
      icon: 'pencil',
      label: i18n.t('project.rename'),
      onselect: () => void project.promptRenameProject(),
    },
    {
      icon: 'settings',
      label: i18n.t('settings.open'),
      shortcut: commandShortcut('settings'),
      onselect: () => settings.show(),
    },
    { separator: true },
    {
      icon: 'folder-plus',
      label: i18n.t('project.new'),
      shortcut: commandShortcut('newProject'),
      onselect: () => void project.createProject(),
    },
    {
      icon: 'folder-open',
      label: i18n.t('project.open'),
      shortcut: commandShortcut('openProject'),
      onselect: () => void project.openProject(),
    },
    {
      icon: 'door-exit',
      label: i18n.t('project.close'),
      shortcut: commandShortcut('closeProject'),
      onselect: () => void project.closeProject(),
    },
  ]
}
