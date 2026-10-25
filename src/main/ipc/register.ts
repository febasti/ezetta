import { ipcMain } from 'electron'
import { forEachInvoke, ipc } from '@shared/ipc'
import type { Handlers } from '@shared/ipc'
import { dispatch } from './dispatch'
import type { Logger } from './dispatch'

/** Registers one `ipcMain.handle` per call declared in `src/shared/ipc.ts`. Only the main frame of
 * a window loaded from a trusted origin may call. */
export function registerIpc(
  handlers: Handlers,
  trustedOrigins: readonly string[],
  log: Logger,
): void {
  forEachInvoke(ipc, (def, path) => {
    const handler = path.reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      handlers,
    )
    if (typeof handler !== 'function') throw new Error(`No handler implemented for ${def.channel}`)
    ipcMain.handle(def.channel, (event, payload: unknown) => {
      const isMainFrame = event.senderFrame !== null && event.senderFrame === event.sender.mainFrame
      return dispatch(
        def,
        handler as (request: never) => unknown,
        { senderUrl: isMainFrame ? event.senderFrame!.url : null, trustedOrigins, payload },
        log,
      )
    })
  })
}
