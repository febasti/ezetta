import { ELEMENTS, WEIGHTS, WEIGHT_NUMBERS, elementById } from './elements'
import type { ResolvedStyle } from './style'
import type { SmallCaps } from './fontFeatures'

/**
 * The fonts the compiler can use and what each family has: its styles and weights, as
 * `typst fonts --variants` lists them (a variable font has a range of weights). The editor offers
 * only what a family has and says where a style asks for something it does not have: Typst never
 * makes up an italic or a bold, it takes the closest variant there is, and says nothing.
 */

export type FontStyle = 'normal' | 'italic' | 'oblique'

export interface FontVariant {
  style: FontStyle
  /** The weights, from and to (the same for a static font). */
  weight: [number, number]
  /** The file it is in, as the compiler lists it; absent for the compiler's own fonts. */
  path?: string
}

export interface FontFamily {
  name: string
  variants: FontVariant[]
  /** Whether the family has real small caps (`fontFeatures.ts`); absent: not known. */
  smallCaps?: SmallCaps
}

/** The family Typst sets when a style names none. */
export const DEFAULT_FONT = 'Libertinus Serif'

/**
 * Reads the output of `typst fonts --variants`: a family on a line of its own, then for each file
 * a line with its path and the lines of its variant (`Style: Normal, Weight: 400, Stretch: 100%`,
 * or for a variable font `Style: Normal`, `Weight: 300-900 (Default: 300)` on lines of their own).
 */
export function parseFontVariants(output: string): FontFamily[] {
  const families = new Map<string, FontVariant[]>()
  let family: FontVariant[] | null = null
  let style: FontStyle | null = null
  let weight: [number, number] | null = null
  let path: string | null = null
  const flush = (): void => {
    if (family && style && weight) family.push({ style, weight, ...(path ? { path } : {}) })
    style = null
    weight = null
  }
  for (const raw of output.split(/\r?\n/)) {
    if (raw.trim() === '') continue
    if (!/^[\s│├└]/.test(raw)) {
      flush()
      path = null
      const name = raw.trim()
      family = families.get(name) ?? []
      families.set(name, family)
      continue
    }
    const line = raw.replace(/^[\s│├└─]+/, '')
    // A file (a path, or `<embedded>` for the compiler's own): its variant follows. Every other
    // line is `Key: value` (Style, Weight, Stretch, the axes of a variable font).
    if (!/^[A-Za-z]+:\s/.test(line)) {
      flush()
      const file = line.replace(/\s*\(Variable\)\s*$/, '').trim()
      path = /^[(<]embedded[)>]$/i.test(file) ? null : file
      continue
    }
    const styleMatch = /Style:\s*(Normal|Italic|Oblique)/i.exec(line)
    if (styleMatch) style = styleMatch[1]!.toLowerCase() as FontStyle
    const weightMatch = /Weight:\s*(\d+)(?:\s*-\s*(\d+))?/.exec(line)
    if (weightMatch) {
      const from = Number(weightMatch[1])
      weight = [from, weightMatch[2] ? Number(weightMatch[2]) : from]
    }
  }
  flush()
  return [...families]
    .map(([name, variants]) => ({ name, variants }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether a family has an italic (or an oblique, which Typst takes for one). */
export const hasItalic = (family: FontFamily): boolean =>
  family.variants.some((v) => v.style !== 'normal')

/** The variants Typst picks from for upright or italic text: the italic ones only where there are some. */
function variantsFor(family: FontFamily, italic: boolean): readonly FontVariant[] {
  const wanted = family.variants.filter((v) => (v.style !== 'normal') === italic)
  return wanted.length > 0 ? wanted : family.variants
}

/** Whether a family has a weight (`bold`, `regular`, …) in upright or italic text. */
export function hasWeight(family: FontFamily, weight: string, italic = false): boolean {
  const n = WEIGHT_NUMBERS[weight]
  if (n === undefined) return true
  return variantsFor(family, italic).some((v) => v.weight[0] <= n && n <= v.weight[1])
}

/** The weight Typst prints instead: the closest the family has. */
export function printedWeight(family: FontFamily, weight: string, italic = false): string {
  const n = WEIGHT_NUMBERS[weight] ?? 400
  let best: string = weight
  let distance = Infinity
  for (const name of WEIGHTS) {
    if (!hasWeight(family, name, italic)) continue
    const d = Math.abs(WEIGHT_NUMBERS[name]! - n)
    if (d < distance) {
      distance = d
      best = name
    }
  }
  return best
}

export const findFamily = (
  families: readonly FontFamily[],
  name: string,
): FontFamily | undefined => {
  const key = name.toLowerCase()
  return families.find((f) => f.name.toLowerCase() === key)
}

/** The family an element is set in: its own, else that of the nearest element above it with one. */
export function elementFont(style: ResolvedStyle, id: string): string {
  for (let el = elementById(id); el; el = el.parent ? elementById(el.parent) : undefined) {
    const font = style[el.id]?.['font']
    if (el.props.includes('font') && typeof font === 'string') return font
  }
  return DEFAULT_FONT
}

export type FontProblem =
  /** A style names a family this machine does not have: Typst sets another. */
  | { kind: 'missing'; element: string; font: string; marker?: true }
  /** An element asks for italic in a family that has none. */
  | { kind: 'italic'; element: string; font: string }
  /** An element asks for a weight the family does not have; `printed` is the one Typst takes. */
  | {
      kind: 'weight'
      element: string
      font: string
      weight: string
      printed: string
      marker?: true
    }
  /** An element asks for small caps in a family that has none: Typst prints the letters as they are. */
  | { kind: 'smallcaps'; element: string; font: string }
  /** The body text's family has no italic, so emphasis in the sheets prints upright. */
  | { kind: 'emphasis'; element: string; font: string }
  /** The body text's family has no heavier weight, so strong words in the sheets print plain. */
  | { kind: 'strong'; element: string; font: string }

/**
 * What a style asks of its fonts that this machine's fonts do not have, element by element, with
 * a missing family said once. Nothing is said when the list of families is empty (the compiler is
 * not there to ask).
 */
export function fontProblems(style: ResolvedStyle, families: readonly FontFamily[]): FontProblem[] {
  if (families.length === 0) return []
  const problems: FontProblem[] = []
  const missing = new Set<string>()
  const fontOf = (id: string): string => elementFont(style, id)
  /** The bullets and numbers of a list, which may have a typeface and a weight of their own. */
  const markerProblems = (id: string): void => {
    const values = style[id] ?? {}
    const own = values['marker_font']
    const font = typeof own === 'string' ? own : fontOf(id)
    const family = findFamily(families, font)
    if (!family) {
      if (typeof own === 'string' && !missing.has(font.toLowerCase())) {
        missing.add(font.toLowerCase())
        problems.push({ kind: 'missing', element: id, font, marker: true })
      }
      return
    }
    const weight = values['marker_weight']
    if (typeof weight === 'string' && !hasWeight(family, weight))
      problems.push({
        kind: 'weight',
        element: id,
        font,
        weight,
        printed: printedWeight(family, weight),
        marker: true,
      })
  }
  for (const element of ELEMENTS) {
    if (element.props.includes('marker_font')) markerProblems(element.id)
    if (!['font', 'italic', 'weight', 'text_case'].some((p) => element.props.includes(p))) continue
    const values = style[element.id] ?? {}
    const font = fontOf(element.id)
    const family = findFamily(families, font)
    if (!family) {
      if (!missing.has(font.toLowerCase())) {
        missing.add(font.toLowerCase())
        problems.push({ kind: 'missing', element: element.id, font })
      }
      continue
    }
    const italic = values['italic'] === true
    if (italic && element.props.includes('italic') && !hasItalic(family))
      problems.push({ kind: 'italic', element: element.id, font })
    if (values['text_case'] === 'smallcaps' && family.smallCaps === 'no')
      problems.push({ kind: 'smallcaps', element: element.id, font })
    const weight = values['weight']
    if (typeof weight === 'string' && !hasWeight(family, weight, italic && hasItalic(family)))
      problems.push({
        kind: 'weight',
        element: element.id,
        font,
        weight,
        printed: printedWeight(family, weight, italic && hasItalic(family)),
      })
    if (element.id === 'body') {
      if (!hasItalic(family)) problems.push({ kind: 'emphasis', element: 'body', font })
      const base = WEIGHT_NUMBERS[typeof weight === 'string' ? weight : 'regular'] ?? 400
      const heavier = family.variants.some((v) => v.style === 'normal' && v.weight[1] > base)
      if (!heavier) problems.push({ kind: 'strong', element: 'body', font })
    }
  }
  return problems
}
