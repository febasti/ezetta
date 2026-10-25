import type { Tree } from '@lezer/common'
import type { TextEdit } from './figures'

/**
 * Formulas: `$x^2$` in the text and `$ E = m c^2 $ <eq-energie>` as a block.
 * Spaces inside the dollar signs make a block, as in Typst. The editor shows each formula as a
 * rendered widget; the rendering itself comes from the Typst compiler, so it matches the export.
 */

export interface Formula {
  /** The extent of `$…$`. */
  from: number
  to: number
  /** Extent including a `<label>` right after a block formula. */
  end: number
  label: string | null
  display: boolean
  /** What is between the dollar signs, without the spaces that mark a block. */
  source: string
  /** The extent of what is between the dollar signs, spaces included. */
  innerFrom: number
  innerTo: number
}

const LABEL = /^[ \t]*<([\p{L}\p{N}_:.-]+)>/u
/** Places where a `$` is not a formula: code, raw text, comments, and notes (their formulas stay source). */
const SKIP = new Set(['Args', 'CodeBlock', 'CodeLine', 'Raw', 'BlockComment', 'LineComment'])

export function scanFormulas(tree: Tree, doc: string): Formula[] {
  const out: Formula[] = []
  tree.iterate({
    enter: (ref) => {
      if (SKIP.has(ref.name)) return false
      if (ref.name === 'Expression') {
        const name = ref.node.getChild('FuncName')
        if (name && doc.slice(name.from, name.to) === 'footnote') return false
        return undefined
      }
      if (ref.name !== 'Math') return undefined
      const inner = doc.slice(ref.from + 1, ref.to - 1)
      const source = inner.trim()
      // An empty equation is never a block, in Typst too.
      const display = source !== '' && /^\s/.test(inner) && /\s$/.test(inner)
      const label = display ? LABEL.exec(doc.slice(ref.to, ref.to + 120)) : null
      out.push({
        from: ref.from,
        to: ref.to,
        end: ref.to + (label ? label[0].length : 0),
        label: label ? label[1]! : null,
        display,
        source,
        innerFrom: ref.from + 1,
        innerTo: ref.to - 1,
      })
      return false
    },
  })
  return out
}

/** The formula whose extent contains the range. */
export function formulaAt(formulas: readonly Formula[], from: number, to = from): Formula | null {
  return formulas.find((f) => f.from <= from && f.end >= to) ?? null
}

// --- writing --------------------------------------------------------------------------------------

/** A `$` inside a formula would end it, so it is written escaped. */
const escapeDollars = (source: string): string => source.replace(/(?<!\\)\$/g, '\\$')

/** The text between the dollar signs: spaces mark a block, and an inline formula has none at its edges. */
function inner(source: string, display: boolean): string {
  const text = escapeDollars(source.trim())
  return display ? ` ${text} ` : text
}

export function formulaSource(source: string, display: boolean): string {
  return `$${inner(source, display)}$`
}

/**
 * The edit that changes a formula's source, and nothing else: it stays an inline or a block formula
 * (what it was made as), and a label behind it stays. Null when nothing would change.
 */
export function updateFormula(doc: string, formula: Formula, source: string): TextEdit | null {
  const text = inner(source, formula.display)
  if (text === doc.slice(formula.innerFrom, formula.innerTo)) return null
  return { from: formula.innerFrom, to: formula.innerTo, insert: text }
}

// --- rendering ------------------------------------------------------------------------------------

/** What the preview does not draw: code in a formula could read files or fetch packages. */
export function previewProblem(source: string): 'code' | 'too_long' | null {
  if (source.length > 4000) return 'too_long'
  return source.includes('#') ? 'code' : null
}

/** The colour the compiler draws in, swapped for `currentColor` afterwards, so one drawing fits both themes. */
const INK = '#010203'
/** A small box in front of an inline formula whose bottom edge marks the baseline. */
const MARK = '#fe00fe'
/** The font size the formulas are drawn at. Sizes in the editor are relative to it. */
export const MATH_SIZE_PT = 10

/** The page the compiler is given for one formula. */
export function mathDocument(source: string, display: boolean): string {
  const head = [
    '#set page(width: auto, height: auto, margin: (x: 0pt, y: 1pt), fill: none)',
    `#set text(size: ${MATH_SIZE_PT}pt, fill: rgb("${INK}"))`,
    '#set math.equation(numbering: none)',
  ].join('\n')
  return display
    ? `${head}\n$ ${source} $\n`
    : `${head}\n#box(width: 1pt, height: 1pt, fill: rgb("${MARK}"))$${source}$\n`
}

export interface RenderedMath {
  /** The SVG markup, drawn in `currentColor`. */
  svg: string
  /** Size in font-size units (em at the size the editor shows the text in). */
  width: number
  height: number
  /** Distance from the top to the baseline, in the same units. Null for a block. */
  baseline: number | null
}

const NUMBER = '-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?'

/**
 * Turns the compiler's SVG into something the editor can place: tidies the colours, cuts off the
 * baseline marker, and reads the size and the baseline. Null if the SVG is not what is expected.
 */
export function parseMathSvg(raw: string, display: boolean): RenderedMath | null {
  const head = new RegExp(
    `<svg[^>]*viewBox="0 0 (${NUMBER}) (${NUMBER})"[^>]*width="(${NUMBER})pt"[^>]*height="(${NUMBER})pt"`,
  ).exec(raw)
  if (!head || /<script|foreignObject|\son\w+\s*=/i.test(raw)) return null
  let width = Number(head[1])
  const height = Number(head[2])
  if (!(width > 0) || !(height > 0)) return null

  let svg = raw.split(`fill="${INK}"`).join('fill="currentColor"')
  let baseline: number | null = null
  if (!display) {
    baseline = markerBottom(svg)
    svg = svg.replace(`fill="${MARK}"`, 'fill="none"')
    // The marker is 1pt wide and sits in front of the formula: cut it off.
    width -= 1
    svg = svg.replace(
      /viewBox="0 0 [^"]*" width="[^"]*pt" height="[^"]*pt"/,
      `viewBox="1 0 ${width} ${height}" width="${width}pt" height="${height}pt"`,
    )
    if (width <= 0) return null
  }
  return {
    svg,
    width: width / MATH_SIZE_PT,
    height: height / MATH_SIZE_PT,
    baseline: baseline === null ? null : baseline / MATH_SIZE_PT,
  }
}

/** The y position of the marker's bottom edge: the sum of the translations around it plus its own size. */
function markerBottom(svg: string): number | null {
  const mark = svg.indexOf(`fill="${MARK}"`)
  if (mark < 0) return null
  const tag = /<\/?g\b[^>]*>|<path\b[^>]*>/g
  const stack: number[] = []
  let sum = 0
  for (let match = tag.exec(svg); match; match = tag.exec(svg)) {
    const text = match[0]
    if (text.startsWith('</g')) sum -= stack.pop() ?? 0
    else if (text.startsWith('<g')) {
      const move = new RegExp(`transform="translate\\((${NUMBER}) (${NUMBER})\\)"`).exec(text)
      const dy = move ? Number(move[2]) : 0
      if (!text.endsWith('/>')) {
        stack.push(dy)
        sum += dy
      }
    } else if (match.index <= mark && mark < match.index + text.length) {
      const lowest = lowestPoint(/d="([^"]*)"/.exec(text)?.[1] ?? '')
      return lowest === null ? null : sum + lowest
    }
  }
  return null
}

/**
 * The largest y a path of straight lines reaches. Typst writes the marker as `M 0 0 L 0 1 L 1 1 L 1 0 Z`
 * (0.13) or `M 0 0v 1h 1v -1Z` (0.15), so moves and lines are read absolute and relative. Null for
 * anything else, such as a curve.
 */
function lowestPoint(d: string): number | null {
  const tokens = d.match(new RegExp(`[MLHVZmlhvz]|${NUMBER}`, 'g')) ?? []
  let command = ''
  let y = 0
  let lowest: number | null = null
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i]!
    if (/^[a-z]$/i.test(token)) {
      command = token
      i += 1
      continue
    }
    const relative = command !== command.toUpperCase()
    const at = (value: number): number => (relative ? y + value : value)
    switch (command.toUpperCase()) {
      case 'M':
      case 'L':
        y = at(Number(tokens[i + 1]))
        i += 2
        break
      case 'H':
        i += 1
        break
      case 'V':
        y = at(Number(tokens[i]))
        i += 1
        break
      default:
        return null
    }
    if (Number.isNaN(y)) return null
    lowest = lowest === null ? y : Math.max(lowest, y)
  }
  return lowest
}
