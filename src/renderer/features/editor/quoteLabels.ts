import { i18n } from '../../i18n/i18n.svelte'
import type { QuoteConfig } from '../../editor/quoteState'

/** The words of the quotes in the text, in the language of the interface. */
export function quoteLabels(): QuoteConfig['labels'] {
  return {
    hint: (words) => i18n.t('quote.hint', { count: words }),
    mark: () => '',
    addSource: i18n.t('quote.addSource'),
    source: i18n.t('quote.source'),
    sourceInvalid: i18n.t('quote.sourceInvalid'),
  }
}
