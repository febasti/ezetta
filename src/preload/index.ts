import { contextBridge, ipcRenderer } from 'electron'
import { buildApi } from '@shared/ipc'

// The only bridge between renderer and main: one typed, versioned object generated from the IPC
// contract. `ipcRenderer` itself is never exposed.
contextBridge.exposeInMainWorld(
  'api',
  buildApi(
    (channel, request) => ipcRenderer.invoke(channel, request),
    (event, listener) => {
      const wrapped = (_event: unknown, payload: unknown): void => listener(payload)
      ipcRenderer.on(event, wrapped)
      return () => {
        ipcRenderer.removeListener(event, wrapped)
      }
    },
  ),
)
