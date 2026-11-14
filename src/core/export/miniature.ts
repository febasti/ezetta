import type { Sets } from './custom'
import { elementFont } from './fonts'
import type { ResolvedStyle } from './style'

/** The languages the picture's words are in: those of the app. */
export type SampleLanguage = 'de' | 'en'

/**
 * The miniature of a template: the picture of it in the list of templates, a taster of the template
 * rather than a page of it. The compiler sets it with the template as it is, on a small page cut to
 * the same size for every template, so all are seen at one scale and the type can be told apart: the
 * template's name as its chapter heading, as large as fits the column on one line, and the first lines
 * of text under it, in the template's faces, colours, columns and notes in the margin. What is not
 * the text (the header, the footer, the page number, wide margins) is left off, and the headings are
 * larger than life.
 */
export interface Miniature {
  /** The sheet to set. */
  sheet: string
  /** Values set on top of the template's style: the small page, no header and footer, the headings. */
  sets: Sets
  /** Options set for the picture: no title page, no contents, no lists of figures or tables. */
  options: Record<string, boolean>
}

/** The taster's page in centimetres: its size, and the small margins round the text. */
export const TASTER = { width: 9, height: 6.3, side: 0.55, top: 0.5, bottom: 0.25 }

/** The paper sizes in centimetres, upright. */
const PAPER: Readonly<Record<string, [number, number]>> = {
  a3: [29.7, 42],
  a4: [21, 29.7],
  a5: [14.8, 21],
  b5: [17.6, 25],
  'us-letter': [21.59, 27.94],
  'us-legal': [21.59, 35.56],
}

const CM_PER_PT = 2.54 / 72
const UNIT_CM: Readonly<Record<string, number>> = { cm: 1, mm: 0.1, in: 2.54, pt: CM_PER_PT }

/** A length in centimetres; `em` counts against `emPt`. Null for anything else (a percentage). */
function cm(value: unknown, emPt: number): number | null {
  const match = /^(-?\d*\.?\d+)(cm|mm|in|pt|em)$/.exec(String(value ?? '').trim())
  if (!match) return null
  const n = Number(match[1])
  return match[2] === 'em' ? n * emPt * CM_PER_PT : n * UNIT_CM[match[2]!]!
}

const length = (centimetres: number): string => `${centimetres.toFixed(2)}cm`

/** The size of an element's type in points: its own size, in em of the body's, or the body's. */
function sizePt(style: ResolvedStyle, id: string, bodyPt: number): number {
  const size = cm(style[id]?.['size'], bodyPt)
  return size === null ? bodyPt : size / CM_PER_PT
}

/** The width of the template's own page in centimetres. */
function pageWidthCm(style: ResolvedStyle, bodyPt: number): number {
  const page = style['page'] ?? {}
  const paper = String(page['paper'] ?? 'a4')
  if (paper === 'custom') return cm(page['page_width'], bodyPt) ?? 21
  const [width, height] = PAPER[paper] ?? [21, 29.7]
  return page['orientation'] === 'landscape' ? height : width
}

/** The width of one column of text in centimetres, beside notes in the margin. */
function columnCm(style: ResolvedStyle, bodyPt: number): number {
  const page = style['page'] ?? {}
  const margins =
    (cm(page['margin_inside'], bodyPt) ?? 2.5) + (cm(page['margin_outside'], bodyPt) ?? 2.5)
  let text = pageWidthCm(style, bodyPt) - margins
  const note = style['footnote'] ?? {}
  if (note['placement'] === 'margin')
    text -= (cm(note['margin_width'], bodyPt) ?? 0) + (cm(note['margin_gap'], bodyPt) ?? 0)
  const columns = Number(page['columns'] ?? 1) || 1
  const gap = cm(page['column_gap'], bodyPt) ?? 0.8
  return Math.max(1, (text - gap * (columns - 1)) / columns)
}

/**
 * How wide a letter of a heading is, in em: a guess the compiler corrects (`fitted`). Capitals are
 * wider than lower case, and every letter of a monospaced face is as wide as the widest.
 */
function letterEm(style: ResolvedStyle, id: string): number {
  const font = elementFont(style, id).toLowerCase()
  if (/mono|courier|code/.test(font)) return 0.62
  const letterCase = style[id]?.['text_case']
  if (letterCase === 'upper') return 0.72
  if (letterCase === 'smallcaps') return 0.5
  return style[id]?.['weight'] === 'bold' ? 0.55 : 0.5
}

/** How much larger than its own size a heading may be drawn: enough to read, not a poster. */
const MAX_GROWTH = { heading_1: 4.5, heading_2: 2 }
/** The largest a heading may be on the taster's page, in points, so text stays under it. */
const MAX_PT = { heading_1: 34, heading_2: 18 }
/** How much of the column the name may take: the number and its gap stand before it. */
const FILL = 0.82
/** How far the compiler may correct the guessed size of a heading's text. */
const CORRECTION = { min: 0.6, max: 1.6 }

interface Heading {
  /** The heading's size in points, set in the style (its number takes it too). */
  size: number
  /** The width the heading's text should take, in points. */
  width: number
  /** How much larger the compiler may set the text than `size`. */
  grow: number
}

/**
 * The size a heading is drawn at, in points, and the width its text should take: the text fills the
 * column, within limits. The size is a guess from the letters (the number and its gap count as three);
 * the compiler measures the text in its face and corrects it (`fitted`).
 */
function enlarged(
  style: ResolvedStyle,
  id: 'heading_1' | 'heading_2',
  text: string,
  bodyPt: number,
  columnPt: number,
): Heading {
  const own = sizePt(style, id, bodyPt)
  const numbered = Number(style[id]?.['number_depth'] ?? style['heading']?.['number_depth'] ?? 0)
  const number = numbered >= (id === 'heading_1' ? 1 : 2) ? 3 : 0
  const em = letterEm(style, id)
  const fits = (columnPt * FILL) / ((text.length + number) * em)
  const size = Math.max(own, Math.min(own * MAX_GROWTH[id], fits, MAX_PT[id]))
  return {
    size,
    width: columnPt * FILL - number * em * size,
    grow: Math.max(1, Math.min(CORRECTION.max, MAX_PT[id] / size)),
  }
}

/**
 * A heading's text as Typst source that the compiler sets to the heading's width: it measures the
 * text in the heading's own type and scales it within limits (a name of a few letters is not blown up
 * past the heading's number, nor past the page). `text` is escaped markup.
 */
const fitted = (text: string, heading: Heading): string =>
  `#context { let t = [${text}]; let k = calc.clamp(${heading.width.toFixed(1)}pt / measure(t).width, ${CORRECTION.min}, ${heading.grow.toFixed(2)}); text(size: k * 1em, t) }`

const escape = (text: string): string => text.replace(/[\\#*_`$@<>[\]=~]/g, (c) => `\\${c}`)

const WORDS: Record<SampleLanguage, { section: string; note: string }> = {
  de: { section: 'Abschnitt', note: 'Eine Anmerkung am Rand.' },
  en: { section: 'Section', note: 'A note in the margin.' },
}

/** Placeholder text, as a type specimen has: no template is judged by what it says. */
const PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.',
]

/** The distances of a heading that are set in em: below it, and from its lines. */
const DISTANCES = ['above', 'below', 'line_above_distance', 'line_below_distance'] as const

/** A heading's distances in em as points at its own size, so they keep it when the heading grows. */
function ownDistances(
  style: ResolvedStyle,
  id: 'heading_1' | 'heading_2',
  bodyPt: number,
): Record<string, string> {
  const own = sizePt(style, id, bodyPt)
  const out: Record<string, string> = {}
  for (const key of DISTANCES) {
    const value = String(style[id]?.[key] ?? '')
    const em = /^(\d*\.?\d+)em$/.exec(value)
    if (em) out[key] = `${(Number(em[1]) * own).toFixed(1)}pt`
  }
  return out
}

/** No header, no footer, no page number: the taster is the text. */
const NO_RUNNING = { slot_left: 'none', slot_center: 'none', slot_right: 'none', divider: false }

export function miniature(style: ResolvedStyle, name: string, language: SampleLanguage): Miniature {
  const words = WORDS[language]
  const bodyPt = sizePt(style, 'body', 11)
  // What the template sets in the width of its page (the gap between columns, the column of notes)
  // shrinks with the page, so the taster keeps its proportions.
  const shrink = Math.min(1, TASTER.width / pageWidthCm(style, bodyPt))
  const scaled = (value: unknown, fallback: number): string =>
    length((cm(value, bodyPt) ?? fallback) * shrink)
  const own = style['page'] ?? {}
  const page: Record<string, string | boolean> = {
    paper: 'custom',
    page_width: length(TASTER.width),
    page_height: length(TASTER.height),
    orientation: 'portrait',
    facing: 'single',
    margin_top: length(TASTER.top),
    margin_bottom: length(TASTER.bottom),
    margin_inside: length(TASTER.side),
    margin_outside: length(TASTER.side),
    column_gap: scaled(own['column_gap'], 0.8),
  }
  const note = style['footnote'] ?? {}
  const inMargin = note['placement'] === 'margin'
  const sets: Sets = { page, header: { ...NO_RUNNING }, footer: { ...NO_RUNNING } }
  if (inMargin)
    sets['footnote'] = {
      margin_width: scaled(note['margin_width'], 5),
      margin_gap: scaled(note['margin_gap'], 0.8),
    }

  // The taster's own style, for the width of its column.
  const taster: ResolvedStyle = {
    ...style,
    page: { ...own, ...page },
    footnote: { ...note, ...sets['footnote'] },
  }
  const columnPt = columnCm(taster, bodyPt) / CM_PER_PT
  const title = enlarged(taster, 'heading_1', name, bodyPt, columnPt)
  // The section's heading is enlarged too, but not to the full column: it is the lesser heading.
  const section = enlarged(taster, 'heading_2', words.section, bodyPt, columnPt * 0.6)
  // The chapter starts at the top of the taster, without the space a chapter opens with. The
  // distances a heading sets in em keep the size they have at its own size: they would grow with it.
  sets['heading_1'] = {
    ...ownDistances(taster, 'heading_1', bodyPt),
    size: `${title.size.toFixed(1)}pt`,
    above: '0em',
  }
  sets['heading_2'] = {
    ...ownDistances(taster, 'heading_2', bodyPt),
    size: `${section.size.toFixed(1)}pt`,
  }

  // A note only where it is beside the text, in the first line: one at the foot would not be on
  // the taster.
  const [first, ...rest] = PARAGRAPHS[0]!.split(', ')
  const opening = inMargin ? `${first}#footnote[${words.note}], ${rest.join(', ')}` : PARAGRAPHS[0]
  const sheet = [
    `= ${fitted(escape(name), title)}`,
    '',
    opening,
    '',
    PARAGRAPHS[1],
    '',
    `== ${fitted(words.section, section)}`,
    '',
    ...PARAGRAPHS.slice(2).flatMap((p) => [p, '']),
  ].join('\n')
  return {
    sheet,
    sets,
    options: { title_page: false, contents: false, list_of_figures: false, list_of_tables: false },
  }
}
