// The kinds of quotation marks a project can choose, kept apart from the quote logic so that the
// project's manifest can know them without importing the editing code.

/** Quotation marks by nesting level: outer, then inner. */
export interface QuoteMarks {
  open: readonly [string, string]
  close: readonly [string, string]
}

/** The kinds of quotation marks a project can choose; `auto` takes those of the project's language. */
export const QUOTE_STYLES = [
  'auto',
  'de',
  'de-guillemets',
  'ch',
  'fr',
  'en',
  'en-single',
  'sv',
  'pl',
  'ja',
] as const
export type QuoteStyle = (typeof QUOTE_STYLES)[number]

export const QUOTE_STYLE_MARKS: Record<Exclude<QuoteStyle, 'auto'>, QuoteMarks> = {
  de: { open: ['„', '‚'], close: ['“', '‘'] },
  'de-guillemets': { open: ['»', '›'], close: ['«', '‹'] },
  ch: { open: ['«', '‹'], close: ['»', '›'] },
  // French sets a narrow no-break space inside the marks.
  fr: { open: ['«\u202F', '‹\u202F'], close: ['\u202F»', '\u202F›'] },
  en: { open: ['“', '‘'], close: ['”', '’'] },
  'en-single': { open: ['‘', '“'], close: ['’', '”'] },
  // Swedish and Finnish: the same mark opens and closes.
  sv: { open: ['”', '’'], close: ['”', '’'] },
  pl: { open: ['„', '«'], close: ['”', '»'] },
  ja: { open: ['「', '『'], close: ['」', '』'] },
}

export function quoteMarks(language: string, style: QuoteStyle = 'auto'): QuoteMarks {
  if (style !== 'auto') return QUOTE_STYLE_MARKS[style]
  return language.startsWith('de') ? QUOTE_STYLE_MARKS.de : QUOTE_STYLE_MARKS.en
}

/** Typst source that sets the marks of every quote and smart quote, or nothing for `auto`. */
export function quoteStyleSetRule(style: QuoteStyle): string | null {
  if (style === 'auto') return null
  const { open, close } = QUOTE_STYLE_MARKS[style]
  return `#set smartquote(quotes: (double: ("${open[0]}", "${close[0]}"), single: ("${open[1]}", "${close[1]}")))`
}
