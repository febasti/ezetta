import { PROPS } from '@core/export/elements'
import type { FontProblem } from '@core/export/fonts'
import { i18n } from '../../i18n/i18n.svelte'

/** What a font problem (`core/export/fonts.ts`) means for the writer, in the interface's language. */
export function fontProblemText(problem: FontProblem): string {
  switch (problem.kind) {
    case 'missing':
      return i18n.t('templates.font.missing', { font: problem.font })
    case 'italic':
      return i18n.t('templates.font.noItalic', { font: problem.font })
    case 'weight': {
      const label = PROPS['weight']!.valueLabels?.[problem.printed]?.[i18n.locale]
      return i18n.t('templates.font.noWeight', { printed: label ?? problem.printed })
    }
    case 'emphasis':
      return i18n.t('templates.font.noEmphasis', { font: problem.font })
    case 'strong':
      return i18n.t('templates.font.noStrong', { font: problem.font })
  }
}
