import { i18n } from '../../i18n/i18n.svelte'
import type { CiteConfig } from '../../editor/citeState'

/** The words of the citation chips in the text, in the language of the interface. */
export function citeLabels(): CiteConfig['labels'] {
  return {
    aria: (text) => i18n.t('cite.aria', { text }),
    missing: (key) => i18n.t('cite.missing', { key }),
    needed: i18n.t('cite.needed'),
    check: (note) => (note ? i18n.t('cite.checkNote', { note }) : i18n.t('cite.checkTitle')),
    unprinted: i18n.t('cite.unprinted'),
  }
}
