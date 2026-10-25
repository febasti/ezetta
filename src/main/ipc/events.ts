import type { WebContents } from 'electron'
import type { z } from 'zod'
import type { EventDef } from '@shared/ipc'

/** Pushes a typed event to the renderer. Does nothing if the window is already gone. */
export function sendEvent<P extends z.ZodType>(
  contents: WebContents | undefined,
  def: EventDef<P>,
  payload: z.input<P>,
): void {
  if (contents && !contents.isDestroyed()) contents.send(def.event, payload)
}
