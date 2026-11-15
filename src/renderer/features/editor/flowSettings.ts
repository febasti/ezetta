import { blockQuoteWords, quoteMarks } from '@core/typst/quotes'
import type { createFlowView } from '../../editor/flowView'
import { markupLabels } from '../../lib/markupLabels'
import { ui } from '../../lib/ui.svelte'
import { bibliography } from '../bibliography/bibliography.svelte'
import { CAPTION_MARKS, headingNumbering } from '../export/numbering.svelte'
import { project } from '../sidebar/project.svelte'
import { citeLabels } from './citeLabels'
import { crossRefSettings } from './crossRefs'
import { figureLabels } from './figureLabels'
import { footnoteLabels } from './footnoteLabels'
import { mathLabels } from './mathLabels'
import { mathService } from './mathService'
import { quoteLabels } from './quoteLabels'
import { tableLabels } from './tableLabels'

type FlowOptions = Parameters<typeof createFlowView>[0]

/**
 * How a read-only view draws sheets, the same as the editor: citations, quotes, formulas, images,
 * tables and notes, numbered from where `first` stands in the project. The continuous view and the
 * pane read beside the editor share it.
 */
export function flowSettings(
  first: string,
): Omit<FlowOptions, 'parent' | 'sources' | 'label' | 'labels' | 'handlers' | 'single'> {
  const language = project.snapshot?.language ?? 'de'
  return {
    lang: language,
    markupLabels,
    showSource: ui.showSource,
    figures: {
      offset: project.figureOffset(first),
      supplement: headingNumbering.captionSupplement('fig', language),
      separator: CAPTION_MARKS[headingNumbering.captionSeparator],
      labels: figureLabels(),
    },
    tables: {
      offset: project.tableOffset(first),
      supplement: headingNumbering.captionSupplement('tbl', language),
      separator: CAPTION_MARKS[headingNumbering.captionSeparator],
      labels: tableLabels(),
    },
    refs: crossRefSettings({ livePath: null }),
    cites: {
      lookup: bibliography.lookup,
      all: () => bibliography.entries,
      language,
      labels: citeLabels(),
    },
    quotes: {
      marks: quoteMarks(language, project.snapshot?.quoteStyle),
      blockFromWords: blockQuoteWords(project.snapshot?.citationStyle ?? ''),
      blockMarks: project.snapshot?.quoteBlockMarks ?? false,
      labels: quoteLabels(),
    },
    math: { service: mathService, labels: mathLabels() },
    footnotes: {
      restart: project.snapshot?.footnoteRestart ?? 'continuous',
      offsets: project.footnoteOffsets(first),
      labels: footnoteLabels(),
    },
  }
}
