import { chipText, isParenthetical } from '@core/bib/cite'
import { readableSheet } from '@core/history/readable'
import type { ReadableOptions } from '@core/history/readable'
import { numberTargets, referenceText, supplementsFor } from '@core/typst/targets'
import { i18n } from '../../i18n/i18n.svelte'
import { bibliography } from '../bibliography/bibliography.svelte'
import { headingNumbering } from '../export/numbering.svelte'
import { project } from '../sidebar/project.svelte'

/**
 * A sheet's source as the editor shows it, for the comparison in the versions dialog: citations
 * and cross-references say what their chips say, a footnote stands at its marker, a quote is in the
 * project's quotation marks, a figure is its caption. References are numbered as the project is
 * numbered now; one whose label is gone keeps its label.
 */
export function readableForComparison(source: string): string {
  const language = project.snapshot?.language ?? 'de'
  const supplements = { ...supplementsFor(language), ...headingNumbering.supplements }
  const targets = numberTargets(project.targetSheets, headingNumbering.current)
  const [open, close] = supplements.quotes ?? ['„', '“']

  const options: ReadableOptions = {
    citation: (group) => {
      const parts = group.map((c) => {
        const entry = bibliography.lookup(c.key)
        if (entry) return chipText(entry, { language, form: c.form, supplement: c.supplement })
        return c.supplement ? `${c.key}, ${c.supplement}` : c.key
      })
      const joined = parts.join('; ')
      return group.every((c) => isParenthetical(c.form)) ? `(${joined})` : joined
    },
    reference: (ref) => {
      if (ref.supplement?.trim()) return ref.supplement.trim()
      const target = targets.find((t) => t.label === ref.label)
      return target ? referenceText(target, supplements) : ref.label
    },
    footnote: (text) => ` [${i18n.t('history.readable.footnote', { text })}]`,
    call: (name, content, args) => {
      const named = (key: string) => args.find((a) => a.name === key)?.text ?? null
      switch (name) {
        case 'quote': {
          const source = named('attribution')
          return `${open}${content ?? ''}${close}${source ? ` — ${source}` : ''}`
        }
        case 'figure': {
          const table = args.some((a) => a.name === null && /^table\s*\(/.test(a.code))
          const word = headingNumbering.captionSupplement(table ? 'tbl' : 'fig', language)
          const caption = named('caption')
          return `[${caption ? `${word}: ${caption}` : word}]`
        }
        case 'image':
          return `[${i18n.t('history.readable.image')}]`
        case 'table':
          return `[${headingNumbering.captionSupplement('tbl', language)}]`
        case 'divider':
          return '* * *'
        default:
          return content ?? args.flatMap((a) => (a.text === null ? [] : [a.text])).join(' ')
      }
    },
  }
  return readableSheet(source, options)
}
