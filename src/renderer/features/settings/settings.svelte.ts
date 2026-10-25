import { call } from '../../lib/api'

export type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'about'

export const SETTINGS_TABS: readonly SettingsTab[] = ['general', 'appearance', 'shortcuts', 'about']

/**
 * The settings window's state. It holds only whether the window is open and on which
 * tab; the values live where they always did (the theme in `appearance`, the language
 * in `i18n`, the editor's own switches in `ui`, the quotation marks in the project).
 */
class SettingsStore {
  open = $state(false)
  tab = $state<SettingsTab>('general')
  /** Whether the next start opens the last project; kept by the main process, which needs it first. */
  reopenLast = $state(false)

  show(tab?: SettingsTab): void {
    if (tab) this.tab = tab
    this.open = true
    void this.loadLaunchBehavior()
  }

  private async loadLaunchBehavior(): Promise<void> {
    const result = await call(window.api.app.launchBehavior({}))
    if (result) this.reopenLast = result.reopenLast
  }

  async setReopenLast(reopenLast: boolean): Promise<void> {
    this.reopenLast = reopenLast
    await call(window.api.app.setLaunchBehavior({ reopenLast }))
  }

  close(): void {
    this.open = false
  }
}

export const settings = new SettingsStore()
