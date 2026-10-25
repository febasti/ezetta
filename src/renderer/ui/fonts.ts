/**
 * The typefaces of the writing surface: one serif, one sans-serif and one monospace face (the
 * writer chooses the style, not the face). All are bundled (`fontFaces.ts`) and under the SIL Open Font License. This only
 * changes how the text looks while writing; the PDF is set by the template.
 */

export type FontKind = 'serif' | 'sans' | 'mono'
export const FONT_KINDS: readonly FontKind[] = ['serif', 'sans', 'mono']

export interface FontChoice {
  id: string
  name: string
  kind: FontKind
  /** The CSS font stack, with fallbacks in case the face cannot be loaded. */
  stack: string
  /**
   * How large the face looks next to the others at the same size: faces differ in the height of
   * their lower-case letters, so one with small letters is scaled up a little.
   */
  scale: number
}

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif"
const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO_FALLBACK = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

export const FONTS: readonly FontChoice[] = [
  {
    id: 'libertinus-serif',
    name: 'Libertinus Serif',
    kind: 'serif',
    stack: `'Libertinus Serif', ${SERIF_FALLBACK}`,
    scale: 1.05,
  },
  {
    id: 'libertinus-sans',
    name: 'Libertinus Sans',
    kind: 'sans',
    stack: `'Libertinus Sans', ${SANS_FALLBACK}`,
    scale: 1.03,
  },
  {
    id: 'plex-mono',
    name: 'IBM Plex Mono',
    kind: 'mono',
    stack: `'IBM Plex Mono', ${MONO_FALLBACK}`,
    scale: 0.92,
  },
]

/** The face of each style. */
export const FONT_OF: Record<FontKind, FontChoice> = {
  serif: FONTS[0]!,
  sans: FONTS[1]!,
  mono: FONTS[2]!,
}

/**
 * The numbers the writer sets for the writing surface, each with its range and step. The size is in
 * pixels before the face's own correction (`scale`), the line spacing a multiple of the size, the
 * space at a line break a multiple of the size, and the width of the text column in pixels,
 * side padding included.
 */
export interface NumberSetting {
  default: number
  min: number
  max: number
  step: number
}
export const FONT_SIZE: NumberSetting = { default: 17.5, min: 12, max: 32, step: 0.5 }
export const LINE_SPACING: NumberSetting = { default: 1.65, min: 1, max: 3, step: 0.05 }
export const PARAGRAPH_GAP: NumberSetting = { default: 0.9, min: 0, max: 3, step: 0.1 }
export const TEXT_WIDTH: NumberSetting = { default: 760, min: 480, max: 1400, step: 10 }

/** The value brought into the range and rounded to the step; the default for anything that is no number. */
export function clampSetting(setting: NumberSetting, value: number): number {
  if (!Number.isFinite(value)) return setting.default
  const stepped = Math.round(value / setting.step) * setting.step
  return Math.min(setting.max, Math.max(setting.min, Math.round(stepped * 100) / 100))
}

/** What the earlier named choices stood for, so a stored choice keeps its look. */
export const LEGACY_FONT_SIZES: Record<string, number> = {
  small: 16,
  normal: 17.5,
  large: 19,
  xlarge: 21,
}
export const LEGACY_LINE_SPACINGS: Record<string, number> = {
  tight: 1.45,
  normal: 1.65,
  wide: 1.85,
}
