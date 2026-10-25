import type { IpcError, Result } from '@shared/ipc'
import { i18n } from '../i18n/i18n.svelte'
import { notify } from './ui.svelte'

export function errorText(error: IpcError): string {
  return i18n.t(`error.${error.code}`, { message: error.message })
}

/** Unwraps an IPC result. A failure becomes a notice and `null`, so callers just stop. */
export async function call<T>(pending: Promise<Result<T>>): Promise<T | null> {
  const result = await pending
  if (result.ok) return result.value
  notify('error', errorText(result.error))
  return null
}
