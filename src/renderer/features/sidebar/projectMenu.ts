import { i18n } from '../../i18n/i18n.svelte'
import { commandShortcut } from '../../lib/commands'
import type { MenuItem } from '../../lib/menu.svelte'
import { exporting } from '../export/export.svelte'
import { history } from '../history/history.svelte'
import { settings } from '../settings/settings.svelte'
import { project } from './project.svelte'

/** The project menu: the project's own actions and settings. The app's are in the settings window. */
export function projectMenuItems(): MenuItem[] {
  return [
    { label: i18n.t('project.new'), onselect: () => void project.createProject() },
    { label: i18n.t('project.open'), onselect: () => void project.openProject() },
    { label: i18n.t('project.rename'), onselect: () => void project.promptRenameProject() },
    { label: i18n.t('project.close'), onselect: () => void project.closeProject() },
    { separator: true },
    { label: i18n.t('project.export'), onselect: () => void exporting.show() },
    { label: i18n.t('history.menu'), onselect: () => void history.show() },
    {
      label: i18n.t('project.footnotesChapter'),
      checked: project.snapshot?.footnoteRestart === 'chapter',
      onselect: () =>
        void project.setFootnoteRestart(
          project.snapshot?.footnoteRestart === 'chapter' ? 'continuous' : 'chapter',
        ),
    },
    { label: i18n.t('project.bibliography'), onselect: () => void project.chooseBibliography() },
    { separator: true },
    {
      label: i18n.t('settings.open'),
      shortcut: commandShortcut('settings'),
      onselect: () => settings.show(),
    },
  ]
}
