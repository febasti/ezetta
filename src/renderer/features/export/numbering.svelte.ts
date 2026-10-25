import { DEFAULT_HEADING_NUMBERING } from '@core/export/numbering'
import type {
  CaptionSeparator,
  HeadingNumbering,
  SupplementOverrides,
} from '@core/export/numbering'
import { supplementsFor } from '@core/typst/targets'

/**
 * What the export's template says about the words and numbers of references, for the chips and the
 * figure and table captions in the text: they say what the PDF prints, so they follow the
 * template of the saved export profile: how headings are numbered, what things are called, and the
 * mark after the number of a caption. Read again when a project opens, after an export (which saves
 * the profile) and after the template editor closes.
 */
class HeadingNumberingStore {
  current = $state.raw<HeadingNumbering>(DEFAULT_HEADING_NUMBERING)
  supplements = $state.raw<SupplementOverrides>({})
  captionSeparator = $state<CaptionSeparator>('colon')

  async refresh(): Promise<void> {
    // Not through `call`: a failure here must not show an error for something the writer did not ask for.
    const result = await window.api.export.numbering({})
    if (!result.ok) return this.reset()
    const { formats, depth, separator, supplements, captionSeparator } = result.value
    this.current = { formats, depth, separator }
    this.supplements = supplements
    this.captionSeparator = captionSeparator
  }

  reset(): void {
    this.current = DEFAULT_HEADING_NUMBERING
    this.supplements = {}
    this.captionSeparator = 'colon'
  }

  /** The word before the number of a caption in the text: the template's, else the language's own. */
  captionSupplement(kind: 'fig' | 'tbl', language: string): string {
    return this.supplements[kind] ?? supplementsFor(language)[kind]
  }
}

export const headingNumbering = new HeadingNumberingStore()

/** The visible mark after the number of a caption in the text: the colon of "Abbildung 1:". */
export const CAPTION_MARKS: Record<CaptionSeparator, string> = {
  colon: ':',
  period: '.',
  dash: ' –',
  space: '',
}
