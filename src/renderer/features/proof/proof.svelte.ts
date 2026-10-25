import { LANGUAGE_VARIANTS, checkerLanguage, ignoreKey } from '@core/proof/issues'
import type { ProofCategory, ProofIssue } from '@core/proof/issues'
import type { ProofState } from '@shared/proof'
import { call } from '../../lib/api'
import { proofActive } from '../../lib/ui.svelte'
import { editor } from '../editor/editorSession.svelte'
import { project } from '../sidebar/project.svelte'

export const CATEGORIES: readonly ProofCategory[] = ['spelling', 'grammar', 'style', 'typography']

/**
 * Spelling and grammar as the renderer sees it: how the checker is, the dictionaries, and
 * the settings of the project. The checking itself is the editor's (`proofing.ts`).
 */
class ProofStore {
  state = $state<ProofState>('off')
  /** Words of the personal and the project dictionary. */
  words = $state.raw<ReadonlySet<string>>(new Set())
  /** Counts up when what the editor draws could change without a new check (a word, an ignore). */
  version = $state(0)

  /** Occurrences ignored in this session. */
  private ignored = new Set<string>()
  private started = false

  /** The settings of the project, with the checker's language worked out. */
  settings = $derived.by(() => {
    const snapshot = project.snapshot
    const proofing = snapshot?.proofing
    return {
      language: checkerLanguage(snapshot?.language ?? 'de', proofing?.language || undefined),
      level: proofing?.level ?? 'default',
      disabledRules: proofing?.disabledRules ?? [],
      disabledCategories: (proofing?.disabledCategories ?? []) as ProofCategory[],
    }
  })

  /** The variants of the project's language the checker knows ("de-AT", "de-CH", …). */
  variants = $derived.by(() => {
    const family = (project.snapshot?.language ?? 'de').slice(0, 2).toLowerCase()
    return LANGUAGE_VARIANTS.filter((variant) => variant.startsWith(`${family}-`))
  })

  async setLanguage(language: string): Promise<void> {
    await project.setProofing({ language })
  }

  init(): void {
    window.api.on.proof.statusChanged(({ state }) => (this.state = state))
  }

  /** Starts the checker (it takes a few seconds) and reads the dictionaries. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    void this.loadWords()
    const result = await window.api.proof.start({})
    if (result.ok) this.state = result.value.state
  }

  ignoredSet = (): ReadonlySet<string> => this.ignored

  async loadWords(): Promise<void> {
    const result = await window.api.proof.words({})
    if (!result.ok) return
    this.words = new Set([...result.value.personal, ...result.value.project])
    this.version += 1
  }

  async addWord(scope: 'personal' | 'project', word: string): Promise<void> {
    const result = await call(window.api.proof.addWord({ scope, word }))
    if (!result) return
    this.words = new Set([...result.personal, ...result.project])
    this.version += 1
  }

  ignore(issue: ProofIssue): void {
    this.ignored.add(ignoreKey(issue))
    this.version += 1
  }

  async disableRule(ruleId: string): Promise<void> {
    const current = project.snapshot?.proofing.disabledRules ?? []
    await project.setProofing({ disabledRules: [...current, ruleId] })
  }

  async enableRule(ruleId: string): Promise<void> {
    const current = project.snapshot?.proofing.disabledRules ?? []
    await project.setProofing({ disabledRules: current.filter((id) => id !== ruleId) })
  }

  /** The strict level (LanguageTool's "picky"): more hints on style, wording and punctuation. */
  async setPicky(on: boolean): Promise<void> {
    await project.setProofing({ level: on ? 'picky' : 'default' })
  }

  async toggleCategory(category: ProofCategory): Promise<void> {
    const current = project.snapshot?.proofing.disabledCategories ?? []
    await project.setProofing({
      disabledCategories: current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    })
  }
}

export const proof = new ProofStore()

/**
 * The open sheet is being checked and nothing is marked in it yet: the first answer is still coming
 * (the server can take some seconds to start). The text says so, so that no underline is not read
 * as no mistake. A check after typing, with the marks there, shows nothing.
 */
export function proofWaiting(): boolean {
  return (
    proofActive() &&
    editor.path !== null &&
    editor.proofChecking &&
    editor.issues.length === 0 &&
    (proof.state === 'off' || proof.state === 'starting' || proof.state === 'ready')
  )
}
