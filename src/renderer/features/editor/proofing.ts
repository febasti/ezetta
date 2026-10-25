import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  closeHoverTooltips,
  hoverTooltip,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { chipText } from '@core/bib/cite'
import { proofUnits } from '@core/proof/extract'
import type { ProofUnit, StandIns } from '@core/proof/extract'
import { issuesOf, keepIssue } from '@core/proof/issues'
import type { CheckerMatch, IssueFilter, ProofCategory, ProofIssue } from '@core/proof/issues'
import { referenceText } from '@core/typst/targets'
import type { ProofState } from '@shared/proof'
import { citeConfig } from '../../editor/citeState'
import { footnoteField } from '../../editor/footnoteState'
import { refConfig, refField, resolve } from '../../editor/refState'
import { fullTree, sourceText } from '../../editor/source'
import { proofTip } from './proofTip'
import type { ProofLabels } from './proofTip'

export interface ProofConfig {
  enabled: boolean
  state: ProofState
  language: string
  level: 'default' | 'picky'
  disabledRules: readonly string[]
  disabledCategories: readonly ProofCategory[]
  words: ReadonlySet<string>
  ignored: ReadonlySet<string>
  /** Counts up when the dictionaries or the ignored occurrences changed. */
  version: number
  labels: ProofLabels
  /** One answer per unit, null for a unit the checker did not answer; null as a whole when it is not ready. */
  check: (units: ProofUnit[]) => Promise<(CheckerMatch[] | null)[] | null>
  onIssues: (issues: ProofIssue[]) => void
  /**
   * The sheet is being checked (true) or the check is done (false). While the server starts, the
   * check waits for it and this stays true.
   */
  onChecking: (checking: boolean) => void
  act: {
    ignore: (issue: ProofIssue) => void
    disableRule: (ruleId: string) => void
    addWord: (scope: 'personal' | 'project', word: string) => void
  }
}

const DEFAULT_CONFIG: ProofConfig = {
  enabled: false,
  state: 'off',
  language: 'de-DE',
  level: 'default',
  disabledRules: [],
  disabledCategories: [],
  words: new Set(),
  ignored: new Set(),
  version: 0,
  labels: {
    category: { spelling: '', grammar: '', style: '', typography: '' },
    ignore: '',
    disableRule: '',
    addToProject: '',
    addToPersonal: '',
    suggestions: '',
    noSuggestion: '',
    moreActions: '',
  },
  check: () => Promise.resolve(null),
  onIssues: () => undefined,
  onChecking: () => undefined,
  act: { ignore: () => undefined, disableRule: () => undefined, addWord: () => undefined },
}

export const proofConfig = Facet.define<Partial<ProofConfig>, ProofConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as ProofConfig,
})

/** Asks for a new check of the whole sheet, ignoring what was remembered. */
export const recheckEffect = StateEffect.define<null>()
/** Draws the issues again from what was remembered (a word was added, an occurrence ignored). */
const redrawEffect = StateEffect.define<null>()

/** Pause after typing before the text is checked. */
const DELAY_MS = 900
/** Units sent at a time: small, so the marks of a long sheet come in as they are found. */
const CHUNK = 16
const CACHE_LIMIT = 4000

/** What citations and cross-references stand for in the sentence the checker reads. */
export function standInsOf(state: EditorState): StandIns {
  const cite = state.facet(citeConfig)
  const refs = state.facet(refConfig)
  const index = state.field(refField, false)
  return {
    citation: (keys) =>
      keys
        .map((key) => {
          const entry = cite.lookup(key)
          return entry ? chipText(entry, { language: cite.language }) : key
        })
        .join('; '),
    reference: (ref) => {
      const resolved = index ? resolve(index, ref.label) : null
      return resolved && resolved.state !== 'missing'
        ? referenceText(resolved.target, refs.supplements)
        : ref.label
    },
  }
}

class ProofPlugin {
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly cache = new Map<string, CheckerMatch[]>()
  /** Units the checker did not answer: left alone until the next full recheck. */
  private readonly unanswered = new Set<string>()
  private running = false
  private shown = ''
  private shownDoc: unknown = null
  private again = false

  constructor(private readonly view: EditorView) {
    if (view.state.facet(proofConfig).enabled) view.state.facet(proofConfig).onChecking(true)
    this.schedule(400)
  }

  update(update: ViewUpdate): void {
    const before = update.startState.facet(proofConfig)
    const after = update.state.facet(proofConfig)
    if (update.transactions.some((tr) => tr.effects.some((e) => e.is(recheckEffect)))) {
      this.cache.clear()
      this.unanswered.clear()
      this.schedule(0)
    } else if (
      update.transactions.some((tr) => tr.effects.some((e) => e.is(redrawEffect))) ||
      before.version !== after.version ||
      before.disabledCategories !== after.disabledCategories ||
      before.words !== after.words
    ) {
      this.schedule(0)
    } else if (
      update.docChanged ||
      before.enabled !== after.enabled ||
      before.state !== after.state ||
      before.language !== after.language ||
      before.level !== after.level ||
      before.disabledRules !== after.disabledRules ||
      update.startState.facet(citeConfig) !== update.state.facet(citeConfig) ||
      update.startState.field(refField, false) !== update.state.field(refField, false)
    ) {
      this.schedule(update.docChanged ? DELAY_MS : 0)
    }
  }

  destroy(): void {
    clearTimeout(this.timer)
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), ms)
  }

  private key(config: ProofConfig, unit: ProofUnit): string {
    return `${config.language}\u0000${config.level}\u0000${config.disabledRules.join(',')}\u0000${JSON.stringify(unit.annotation)}`
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    try {
      const { view } = this
      const state = view.state
      const config = state.facet(proofConfig)
      if (!config.enabled) {
        this.show(view, [], config)
        return
      }
      const text = sourceText(state)
      const tree = fullTree(state)
      const units = proofUnits(tree, text, standInsOf(state))
      const issuesOfUnits = (): ProofIssue[] =>
        units.flatMap((unit) => issuesOf(unit, this.cache.get(this.key(config, unit)) ?? [], text))
      const missing = units.filter((unit) => {
        const key = this.key(config, unit)
        return !this.cache.has(key) && !this.unanswered.has(key)
      })
      if (missing.length > 0) {
        // What is known is shown at once, and the rest as it comes, those nearest to what the
        // writer sees first: a long sheet is not waited for as a whole.
        config.onChecking(true)
        this.show(view, issuesOfUnits(), config, false)
        const visible = view.visibleRanges[0]
        const pivot = visible ? (visible.from + visible.to) / 2 : state.selection.main.head
        const distance = (unit: ProofUnit): number =>
          unit.from <= pivot && pivot <= unit.to
            ? 0
            : Math.min(Math.abs(unit.from - pivot), Math.abs(unit.to - pivot))
        missing.sort((a, b) => distance(a) - distance(b))
      }
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK)
        const results = await config.check(chunk)
        if (results === null) return // the checker is not ready; the state change checks again
        if (this.cache.size > CACHE_LIMIT) this.cache.clear()
        chunk.forEach((unit, at) => {
          const found = results[at] ?? null
          if (found === null) this.unanswered.add(this.key(config, unit))
          else this.cache.set(this.key(config, unit), found)
        })
        // The text went on while the checker worked: its results are kept, and the text is read again.
        if (view.state.doc !== state.doc) {
          this.again = true
          return
        }
        if (i + CHUNK < missing.length) this.show(view, issuesOfUnits(), config, false)
      }
      this.show(view, issuesOfUnits(), view.state.facet(proofConfig), true)
    } finally {
      this.running = false
      if (this.again) {
        this.again = false
        this.schedule(DELAY_MS)
      }
    }
  }

  private show(view: EditorView, found: ProofIssue[], config: ProofConfig, done = true): void {
    const filter: IssueFilter = {
      words: config.words,
      disabledRules: new Set(config.disabledRules),
      disabledCategories: new Set(config.disabledCategories),
      ignored: config.ignored,
    }
    const issues = found.filter((issue) => keepIssue(issue, filter))
    // The same issues again: leave the underlines (and a tooltip someone is reading) alone.
    const signature = issues
      .map((i) => `${i.from}:${i.to}:${i.ruleId}:${i.replacements.join('|')}`)
      .join(';')
    config.onChecking(!done)
    if (signature === this.shown && view.state.doc === this.shownDoc) return
    this.shown = signature
    this.shownDoc = view.state.doc
    view.dispatch({ effects: setIssuesEffect.of(issues) })
    config.onIssues(issues)
  }
}

/** The issues of the sheet, drawn as underlines coloured by kind; each mark carries its issue. */
const setIssuesEffect = StateEffect.define<readonly ProofIssue[]>()
const issueField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setIssuesEffect))
        return Decoration.set(
          effect.value
            .filter((issue) => issue.to > issue.from)
            .map((issue) =>
              Decoration.mark({ class: `cm-proof cm-proof-${issue.category}`, issue }).range(
                issue.from,
                issue.to,
              ),
            ),
          true,
        )
    return tr.docChanged ? value.map(tr.changes) : value
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** The issue under the pointer, where its words are now. */
function issueAt(
  state: EditorState,
  pos: number,
): { issue: ProofIssue; from: number; to: number } | null {
  let found: { issue: ProofIssue; from: number; to: number } | null = null
  state.field(issueField).between(pos, pos, (from, to, value) => {
    if (from > pos || to < pos) return
    found = { issue: value.spec.issue as ProofIssue, from, to }
    return false
  })
  return found
}

/**
 * Hovering an underline shows the issue as a card like an open entry of the Prüfung tab: its kind,
 * the explanation, the suggestions, and the other actions. A suggestion replaces the words where
 * they are now; the card closes with any change.
 */
const proofHover = hoverTooltip(
  (view, pos) => {
    const hit = issueAt(view.state, pos)
    if (!hit) return null
    const config = view.state.facet(proofConfig)
    const { issue } = hit
    const done = (): void => view.dispatch({ effects: closeHoverTooltips })
    return {
      pos: hit.from,
      end: hit.to,
      above: false,
      create: () => ({
        dom: proofTip(issue, config.labels, {
          apply: (value) => {
            const now = issueAt(view.state, hit.from)
            if (!now || now.issue !== issue) return done()
            view.dispatch({
              changes: { from: now.from, to: now.to, insert: value },
              userEvent: 'input.complete',
            })
          },
          addWord: (scope) => {
            config.act.addWord(scope, issue.text)
            done()
          },
          ignore: () => {
            config.act.ignore(issue)
            done()
          },
          disableRule: () => {
            config.act.disableRule(issue.ruleId)
            done()
          },
        }),
      }),
    }
  },
  { hideOnChange: true },
)

/** Marks the issue the list in the sidebar has open: its words get a background. */
const focusEffect = StateEffect.define<{ from: number; to: number } | null>()
const focusField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(focusEffect)) return effect.value
    if (!value || !tr.docChanged) return value
    // An edit in the marked words ends the mark; an edit elsewhere only moves it.
    return tr.changes.touchesRange(value.from, value.to)
      ? null
      : { from: tr.changes.mapPos(value.from, 1), to: tr.changes.mapPos(value.to, -1) }
  },
  provide: (field) =>
    EditorView.decorations.from(field, (range) =>
      range
        ? Decoration.set([Decoration.mark({ class: 'cm-proof-focus' }).range(range.from, range.to)])
        : Decoration.none,
    ),
})

/**
 * Shows an issue in the text without selecting it: the sheet scrolls there and the words get a
 * background. For a note's text, the sheet scrolls to the note. Null takes the mark away.
 */
export function showIssue(view: EditorView, issue: ProofIssue | null): void {
  if (!issue) {
    view.dispatch({ effects: focusEffect.of(null) })
    return
  }
  const note = view.state
    .field(footnoteField, false)
    ?.find((n) => n.contentFrom <= issue.from && issue.to <= n.contentTo)
  view.dispatch({
    effects: [
      focusEffect.of(note ? null : { from: issue.from, to: issue.to }),
      EditorView.scrollIntoView(note ? note.from : issue.from, { y: 'center' }),
    ],
  })
}

/** Puts a suggestion in the place of an issue, if the words are still where the issue says. */
export function applyIssue(view: EditorView, issue: ProofIssue, value: string): boolean {
  if (view.state.sliceDoc(issue.from, issue.to) !== issue.text) return false
  view.dispatch({
    changes: { from: issue.from, to: issue.to, insert: value },
    userEvent: 'input.complete',
  })
  return true
}

export const recheck = (view: EditorView): void =>
  view.dispatch({ effects: recheckEffect.of(null) })
export const redraw = (view: EditorView): void => view.dispatch({ effects: redrawEffect.of(null) })

/**
 * Underlines issues of spelling and grammar, with the checker's answers cached per unit,
 * and shows each in a card on hover.
 */
export const proofing: Extension = [
  ViewPlugin.fromClass(ProofPlugin),
  issueField,
  proofHover,
  focusField,
]
