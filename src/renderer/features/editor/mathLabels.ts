import { i18n } from '../../i18n/i18n.svelte'
import type { MathConfig } from '../../editor/mathState'

/** The words of the formulas in the text and of their editor, in the language of the interface. */
export function mathLabels(): MathConfig['labels'] {
  return {
    aria: (source) => i18n.t('math.aria', { source }),
    empty: i18n.t('math.empty'),
    editor: i18n.t('math.editor'),
    source: i18n.t('math.source'),
    hint: i18n.t('math.hint'),
    problem: {
      title: (problem) =>
        problem.kind === 'unknown'
          ? i18n.t(problem.backslash ? 'math.error.backslash.title' : 'math.error.unknown.title', {
              name: problem.name,
            })
          : i18n.t(`math.error.${problem.kind}.title`),
      hint: (problem) =>
        problem.kind === 'unclosed'
          ? i18n.t('math.error.unclosed.hint', { open: problem.open, close: problem.close })
          : problem.kind === 'unknown'
            ? i18n.t(problem.backslash ? 'math.error.backslash.hint' : 'math.error.unknown.hint', {
                name: problem.name,
              })
            : i18n.t(`math.error.${problem.kind}.hint`),
      place: (line, column) => i18n.t('math.error.place', { line, column }),
      compiler: (message) => i18n.t('math.error.compiler', { message }),
    },
  }
}
