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
