import type { OptionValues } from './template'

/**
 * An export profile: a named combination of template, its options, the citation style,
 * and what happens to highlights and comments. Stored as `[[export]]` in `project.toml`.
 */
export interface ExportProfile {
  name: string
  template: string
  /** An id from `CITATION_STYLES`. */
  citationStyle: string
  /** Highlights (Anmerkungen): hidden, or shown as marked text. */
  marks: 'hide' | 'show'
  /** Comments (Kommentare): left out, or put in as footnotes (for a review). */
  comments: 'remove' | 'footnote'
  /** Hyphenation of the whole document; absent: what the template's body text says. */
  hyphenate?: boolean
  /**
   * The binding offset ("Bindekorrektur"): space added to the inside margin for what the binding
   * takes, an absolute length (`checkBinding`); absent: none.
   */
  binding?: string
  options: OptionValues
}

export const DEFAULT_TEMPLATE = 'monographie'

export const defaultProfile = (citationStyle: string): ExportProfile => ({
  name: 'Abgabe',
  template: DEFAULT_TEMPLATE,
  citationStyle,
  marks: 'hide',
  comments: 'remove',
  options: {},
})

/** Millimetres in one unit of an absolute length. */
const MM: Readonly<Record<string, number>> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }

/**
 * A binding offset as the profile keeps it: an absolute length from 0 to 3 cm (`8mm`, `1cm`,
 * `0.4in`), with a comma read as a decimal point; null for anything else.
 */
export function checkBinding(text: string): string | null {
  const value = text.trim().replace(',', '.').replace(/\s+/g, '')
  const match = /^(\d+(?:\.\d+)?|\.\d+)(mm|cm|in|pt)$/.exec(value)
  if (!match) return null
  const mm = Number(match[1]) * MM[match[2]!]!
  return mm <= 30 ? value : null
}
