import type { InvokeDef, Result } from '@shared/ipc'
import { err, IpcFailure, ok } from '@shared/ipc'
import { isTrustedUrl } from '../security/origin'

export type Logger = (message: string, cause?: unknown) => void

/**
 * Runs one IPC call: checks the sender, validates the request against the contract's schema, runs
 * the handler, validates the response, and turns every failure into a typed result. Free of
 * Electron imports so it is unit-testable.
 */
export async function dispatch(
  def: InvokeDef,
  handler: (request: never) => unknown,
  call: { senderUrl: string | null; trustedOrigins: readonly string[]; payload: unknown },
  log: Logger,
): Promise<Result<unknown>> {
  if (!isTrustedUrl(call.senderUrl, call.trustedOrigins)) {
    log(`rejected ${def.channel} from untrusted sender: ${String(call.senderUrl)}`)
    return err('forbidden', 'Untrusted sender')
  }
  const request = def.request.safeParse(call.payload)
  if (!request.success) return err('invalid_request', 'Request does not match the contract')
  try {
    const value = await handler(request.data as never)
    const response = def.response.safeParse(value)
    if (!response.success) {
      log(`${def.channel} produced an invalid response`, response.error)
      return err('internal', 'Internal error')
    }
    return ok(response.data)
  } catch (cause) {
    if (cause instanceof IpcFailure) return err(cause.code, cause.message)
    log(`${def.channel} failed`, cause)
    return err('internal', 'Internal error')
  }
}
