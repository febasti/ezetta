import { i18n } from '../../i18n/i18n.svelte'
import type { TableConfig } from '../../editor/tableState'

/** The words of the tables in the text, in the language of the interface. */
export function tableLabels(): TableConfig['labels'] {
  return {
    aria: (supplement, number, caption) => i18n.t('table.aria', { supplement, number, caption }),
    ariaPlain: i18n.t('table.ariaPlain'),
    captionPlaceholder: i18n.t('table.captionPlaceholder'),
    cell: (row, column) => i18n.t('table.cell', { row, column }),
    invalid: i18n.t('table.invalid'),
  }
}
