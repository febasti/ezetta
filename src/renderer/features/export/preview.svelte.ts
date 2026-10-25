import type { z } from 'zod'
import type { diagnosticSchema, profileSchema } from '@shared/export'
import { call } from '../../lib/api'

export type Diagnostic = z.infer<typeof diagnosticSchema>
type Profile = z.infer<typeof profileSchema>
/**
 * The pages of the export dialog's preview: the project as the profile being edited sets
 * it, as images that the main process makes with the compiler. Asking again while one is being made
 * supersedes it, so a burst of edits costs one compile.
 */
class PreviewStore {
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle')
  pages = $state(0)
  /** Changes with every refresh, so an image is not taken from the cache. */
  stamp = $state('')
  diagnostics = $state.raw<Diagnostic[]>([])
  noCompiler = $state(false)
  /** A refresh is running (the pages shown may be of the text before). */
  busy = $state(false)
  /** The profile as it is being edited in the dialog, instead of the saved one. */
  profile = $state.raw<Profile | null>(null)

  private running = 0

  async refresh(): Promise<void> {
    const mine = ++this.running
    this.busy = true
    if (this.status === 'idle') this.status = 'loading'
    const result = await call(
      window.api.export.preview(this.profile ? { profile: this.profile } : {}),
    )
    if (mine !== this.running) return // a newer refresh is on its way
    this.busy = false
    if (result === null) {
      this.status = 'error'
      return
    }
    if (result.ok) {
      this.pages = result.pages
      this.stamp = result.stamp
      this.diagnostics = result.diagnostics
      this.noCompiler = false
      this.status = 'ready'
      return
    }
    if (result.reason === 'superseded') return
    this.noCompiler = result.reason === 'no_compiler'
    this.diagnostics = result.diagnostics
    this.pages = 0
    this.status = 'error'
  }

  /** Forgets the pages (the dialog closed, or the project). */
  reset(): void {
    this.running += 1
    this.busy = false
    this.status = 'idle'
    this.pages = 0
    this.diagnostics = []
  }
}

export const preview = new PreviewStore()
