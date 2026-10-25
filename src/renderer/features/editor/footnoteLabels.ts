import { i18n } from '../../i18n/i18n.svelte'
import type { FootnoteConfig } from '../../editor/footnoteState'

/** The words of the footnotes in the text, in the language of the interface. */
export function footnoteLabels(): FootnoteConfig['labels'] {
  return {
    marker: (number, text) => i18n.t('footnote.marker', { number, text }),
    edit: (number) => i18n.t('footnote.edit', { number }),
    card: (number) => i18n.t('footnote.card', { number }),
    empty: i18n.t('footnote.empty'),
  }
}
