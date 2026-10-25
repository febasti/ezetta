import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ Menu: {} }))

import { toTemplate } from './nativeMenu'

describe('toTemplate', () => {
  it('turns the description into an Electron template, and reports the chosen id', () => {
    const chosen = vi.fn()
    const template = toTemplate(
      [
        { label: 'Betont', id: '0', type: 'checkbox', checked: true, accelerator: 'CmdOrCtrl+B' },
        { type: 'separator' },
        { label: 'Kopieren', role: 'copy', type: 'normal', enabled: false },
        {
          label: 'Einfügen',
          type: 'normal',
          submenu: [{ label: 'Fußnote', id: '2.0', type: 'normal' }],
        },
      ],
      chosen,
    )
    expect(template[0]).toMatchObject({
      label: 'Betont',
      type: 'checkbox',
      checked: true,
      accelerator: 'CmdOrCtrl+B',
      registerAccelerator: false,
    })
    expect(template[1]).toEqual({ type: 'separator' })
    expect(template[2]).toEqual({ label: 'Kopieren', enabled: false, role: 'copy' })
    template[0]!.click!({} as never, undefined, {} as never)
    expect(chosen).toHaveBeenCalledWith('0')
    const sub = (template[3] as { submenu: { click: () => void }[] }).submenu
    sub[0]!.click()
    expect(chosen).toHaveBeenLastCalledWith('2.0')
  })
})
