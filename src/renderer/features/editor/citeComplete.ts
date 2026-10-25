import { autocompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { chipText, matchesQuery } from '@core/bib/cite'
import { insideOpaque } from '@core/typst/edit'
import { isCitableKey } from '@core/typst/citations'
import { referenceText } from '@core/typst/targets'
import type { NumberedTarget } from '@core/typst/targets'
import { citeConfig } from '../../editor/citeState'
import { refConfig, refField } from '../../editor/refState'
import { labelFor } from './refEditor'

const MAX_OPTIONS = 60
/** Most cross-references the menu offers at once, so they do not push the works out. */
const MAX_TARGETS = 24

/** The beginning of a reserved prefix, or a label that starts with one: the writer wants a cross-reference. */
const WANTS_TARGET = /^(?:f(?:ig?)?|t(?:bl?)?|e(?:q)?|s(?:ec?)?)(?:-|$)/i

/**
 * `@` in the text offers the works of the bibliography: type a few letters of the key,
 * an author, the year, or the title. Choosing one writes the key, and the chip appears. It offers
 * the cross-references too (the headings, figures, tables, and block formulas of the project): type
 * "abb" or "Methoden". A target without a label gets one when it is chosen.
 */
function citeSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/@[\p{L}\p{N}_:.-]*/u)
  if (!match) return null
  // `name@example.org` is not a citation, and neither is anything in code, math, or raw text.
  const before = context.state.sliceDoc(Math.max(0, match.from - 1), match.from)
  if (/[\p{L}\p{N}]/u.test(before)) return null
  if (insideOpaque(syntaxTree(context.state), match.from)) return null
  const config = context.state.facet(citeConfig)
  const query = match.text.slice(1)
  const works: Completion[] = config
    .all()
    .filter((entry) => isCitableKey(entry.key) && matchesQuery(entry, query))
    .sort((a, b) => {
      const prefix = (key: string): number =>
        key.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1
      return prefix(a.key) - prefix(b.key) || a.key.localeCompare(b.key)
    })
    .slice(0, MAX_OPTIONS)
    .map((entry) => ({
      label: entry.key,
      detail: chipText(entry, { language: config.language }),
      info: entry.title ?? undefined,
      type: 'text',
    }))
  const targets = targetOptions(context, query)
  const options = WANTS_TARGET.test(query)
    ? [...targets, ...works].slice(0, MAX_OPTIONS)
    : [...works.slice(0, MAX_OPTIONS - targets.length), ...targets]
  if (options.length === 0 && query === '') return null
  return { from: match.from + 1, options, filter: false, validFor: /^[\p{L}\p{N}_:.-]*$/u }
}

function targetOptions(context: CompletionContext, query: string): Completion[] {
  const { targets } = context.state.field(refField, false) ?? { targets: [] }
  const { supplements, sheetName } = context.state.facet(refConfig)
  const needle = query.toLowerCase()
  return targets
    .filter((target) => target.inExport)
    .filter(
      (target) =>
        needle === '' ||
        `${referenceText(target, supplements)} ${target.title} ${target.label ?? ''} ${sheetName(target.path)}`
          .toLowerCase()
          .includes(needle),
    )
    .slice(0, MAX_TARGETS)
    .map((target) => completionFor(target, referenceText(target, supplements)))
}

function completionFor(target: NumberedTarget, text: string): Completion {
  return {
    // Without a label the text typed so far stays until the label is made.
    label: target.label ?? text,
    displayLabel: text,
    detail: target.title,
    type: 'xref',
    apply: (view, _completion, from, to) => {
      const typed = view.state.sliceDoc(from, to)
      void (async () => {
        const made = await labelFor(view, target)
        if (!made) return
        // The text went on while another sheet was written: leave it alone.
        if (view.state.sliceDoc(from, to) !== typed) return
        const changes = [{ from, to, insert: made.label }, ...(made.edit ? [made.edit] : [])]
        const mapped = view.state.changes(changes)
        view.dispatch({
          changes: mapped,
          selection: EditorSelection.cursor(mapped.mapPos(to, 1)),
          userEvent: 'input.complete',
        })
      })()
    },
  }
}

export const citeComplete: Extension = autocompletion({
  override: [citeSource],
  icons: false,
  defaultKeymap: true,
})
