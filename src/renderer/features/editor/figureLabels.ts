import { i18n } from '../../i18n/i18n.svelte'
import type { FigureConfig } from '../../editor/figureState'

/** The words of the figures in the text, in the language of the interface. */
export function figureLabels(): FigureConfig['labels'] {
  return {
    aria: (supplement, number, caption) => i18n.t('figure.aria', { supplement, number, caption }),
    ariaPlain: (caption) => i18n.t('figure.ariaPlain', { caption }),
    missing: (path) => i18n.t('figure.missing', { path }),
    invalid: (path) => i18n.t('figure.invalid', { path }),
    empty: i18n.t('figure.empty'),
    chooseImage: i18n.t('figure.chooseImage'),
    replaceImage: i18n.t('figure.replace'),
    captionPlaceholder: i18n.t('figure.captionPlaceholder'),
    captionInvalid: i18n.t('figure.captionInvalid'),
    tools: i18n.t('figure.tools'),
    width: i18n.t('figure.width'),
    widthOf: (value) => i18n.t('figure.widthOf', { value }),
  }
}
