import { i18n } from '../i18n/i18n.svelte'
import type { MarkupLabels } from '../editor/markup'

/** Texts the markup decorations need from the i18n layer. */
export const markupLabels: MarkupLabels = {
  comment: (text) => i18n.t('comment.label', { text }),
}
