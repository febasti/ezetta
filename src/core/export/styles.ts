/**
 * Citation styles the export offers. The id is what `project.toml` stores; `typst` is the
 * name of the bundled CSL style that Typst knows.
 */
export interface CitationStyle {
  id: string
  typst: string
  /** Shown in the picker. */
  label: string
}

export const CITATION_STYLES: readonly CitationStyle[] = [
  { id: 'apa-7', typst: 'apa', label: 'APA 7 (Autor, Jahr)' },
  { id: 'chicago-author-date', typst: 'chicago-author-date', label: 'Chicago (Autor, Jahr)' },
  { id: 'chicago-notes', typst: 'chicago-notes', label: 'Chicago (Fußnoten)' },
  { id: 'harvard', typst: 'harvard-cite-them-right', label: 'Harvard' },
  { id: 'mla', typst: 'modern-language-association', label: 'MLA' },
  { id: 'ieee', typst: 'ieee', label: 'IEEE (Nummern)' },
  // Typst 0.15 calls it by the NLM name ("vancouver" still works, with a warning).
  { id: 'vancouver', typst: 'nlm-citation-sequence', label: 'Vancouver (Nummern)' },
  { id: 'nature', typst: 'nature', label: 'Nature (Nummern)' },
]

/** The Typst style for a stored id; an id the app does not know falls back to APA. */
export const typstStyleFor = (id: string): string =>
  CITATION_STYLES.find((style) => style.id === id)?.typst ?? 'apa'
