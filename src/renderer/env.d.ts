/// <reference types="svelte" />
/// <reference types="vite/client" />
import type { EzettaApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Generated from the IPC contract; exposed by the preload script. */
    readonly api: EzettaApi
  }
}
