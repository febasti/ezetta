import type { Tree } from '@lezer/common'
import { balanced, callIn, parseArgs, stringValue, typstString } from './args'
import { plainText } from './footnotes'
import { newId } from './ids'
import { parseTypst } from './parser'

/**
 * Images. Three forms are understood, and only these are shown as images:
 *
 *   `#figure(image("assets/a.png", width: 80%), caption: [Text]) <fig-a>`   a numbered figure
 *   `#image("assets/a.png", width: 50%)`                                      a bare block image
 *   `#box(image("assets/icon.png", height: 1em))`                             an image in the text
 *
 * A figure whose image is not chosen yet holds a plain frame instead, as a placeholder that Typst
 * prints as an empty box (and numbers like any figure):
 *
 *   `#figure(rect(width: 100%, height: 6cm), caption: [Text]) <fig-k4x9tm>`
 *
 * Anything else, such as a figure holding a table or an image with a computed path, stays visible
 * as source. Arguments the app has no field for are kept when a figure is edited.
 */

export type FigureKind = 'figure' | 'image' | 'inline'

export interface Figure {
  kind: FigureKind
  /** Extent of the expression, and of the expression plus a `<label>` right after it. */
  from: number
  to: number
  end: number
  /** The figure's identity: its label, made when the figure is placed and never derived from the file. */
  label: string | null
  /** True for a placeholder: the figure has no image yet (and `path` is empty). */
  empty: boolean
  /** The image path as written, relative to the project. */
  path: string
  /** Where the path's string literal is, quotes included (the export makes it absolute). For a
   * placeholder: the frame that stands in for the image. */
  pathFrom: number
  pathTo: number
  width: string | null
  height: string | null
  alt: string | null
  /** The caption's text without markup, and the extent of what is between its brackets. */
  caption: { from: number; to: number; text: string } | null
}

const LABEL = /^[ \t]*<([\p{L}\p{N}_:.-]+)>/u

interface ImageCall {
  path: string
  pathFrom: number
  pathTo: number
  width: string | null
  height: string | null
  alt: string | null
}

/** Reads `image("path", width: …, height: …, alt: "…")` from a value, or null for anything else. */
function readImage(doc: string, from: number, to: number): ImageCall | null {
  const call = callIn(doc, from, to)
  if (!call || call.name !== 'image') return null
  const args = parseArgs(doc, call.open, call.close)
  const first = args.find((a) => a.name === null)
  const path = first ? stringValue(doc, first.valueFrom, first.valueTo) : null
  if (path === null) return null
  const named = (name: string): string | null => {
    const arg = args.find((a) => a.name === name)
    return arg ? doc.slice(arg.valueFrom, arg.valueTo) : null
  }
  const alt = args.find((a) => a.name === 'alt')
  return {
    path,
    pathFrom: first!.valueFrom,
    pathTo: first!.valueTo,
    width: named('width'),
    height: named('height'),
    alt: alt ? stringValue(doc, alt.valueFrom, alt.valueTo) : null,
  }
}

/** What a placeholder frame reads as: no path, no sizes. */
const placeholderOf = (from: number, to: number): ImageCall => ({
  path: '',
  pathFrom: from,
  pathTo: to,
  width: null,
  height: null,
  alt: null,
})

export function scanFigures(tree: Tree, doc: string): Figure[] {
  const out: Figure[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'Expression') return undefined
      const node = ref.node
      const nameNode = node.getChild('FuncName')
      const argsNode = node.getChild('Args')
      const name = nameNode ? doc.slice(nameNode.from, nameNode.to) : ''
      if (name === 'footnote') return false // images in a note are not shown
      if (!argsNode || (name !== 'figure' && name !== 'image' && name !== 'box')) return undefined
      const args = parseArgs(doc, argsNode.from, argsNode.to - 1)

      let image: ImageCall | null = null
      let empty = false
      let kind: FigureKind
      if (name === 'image') {
        image = readImage(doc, nameNode!.from, argsNode.to)
        kind = 'image'
      } else {
        kind = name === 'figure' ? 'figure' : 'inline'
        for (const arg of args) {
          if (arg.name !== null) continue
          image = readImage(doc, arg.valueFrom, arg.valueTo)
          if (
            !image &&
            kind === 'figure' &&
            callIn(doc, arg.valueFrom, arg.valueTo)?.name === 'rect'
          ) {
            image = placeholderOf(arg.valueFrom, arg.valueTo)
            empty = true
          }
          if (image) break
        }
      }
      if (!image) return undefined

      let caption: Figure['caption'] = null
      const captionArg = kind === 'figure' ? args.find((a) => a.name === 'caption') : undefined
      if (captionArg && doc[captionArg.valueFrom] === '[' && doc[captionArg.valueTo - 1] === ']') {
        const from = captionArg.valueFrom + 1
        const to = captionArg.valueTo - 1
        const inner = doc.slice(from, to)
        caption = { from, to, text: plainText(parseTypst(inner), inner, 0, inner.length) }
      }
      const label = kind === 'inline' ? null : LABEL.exec(doc.slice(node.to, node.to + 120))
      out.push({
        kind,
        from: node.from,
        to: node.to,
        end: node.to + (label ? label[0].length : 0),
        label: label ? label[1]! : null,
        empty,
        ...image,
        caption,
      })
      return false
    },
  })
  return out
}

/** The figure whose extent contains the range. */
export function figureAt(figures: readonly Figure[], from: number, to = from): Figure | null {
  return figures.find((f) => f.from <= from && f.end >= to) ?? null
}

// --- writing --------------------------------------------------------------------------------------

export interface FigureOptions {
  /** The image's path; empty for a placeholder (a figure whose image is not chosen yet). */
  path: string
  width?: string | null
  height?: string | null
  alt?: string | null
  caption?: string | null
  label?: string | null
}

/** Source for a new image, in one of the forms above. */
export function figureSource(kind: FigureKind, options: FigureOptions): string {
  const extras = [
    options.width ? `width: ${options.width}` : '',
    options.height ? `height: ${options.height}` : '',
    options.alt ? `alt: ${typstString(options.alt)}` : '',
  ].filter(Boolean)
  const image = `image(${[typstString(options.path), ...extras].join(', ')})`
  if (kind === 'inline') return `#box(${image})`
  if (kind === 'image') return `#${image}`
  const label = options.label ? ` <${options.label}>` : ''
  const body = options.path === '' ? PLACEHOLDER : image
  return `#figure(\n  ${body},\n  caption: [${options.caption ?? ''}],\n)${label}`
}

/** The frame that stands in for an image that is not chosen yet. */
export const PLACEHOLDER = 'rect(width: 100%, height: 6cm)'

/** The id of a new figure (`fig-k4x9tm`); see `newId`. */
export const newFigureId = (doc: string, random?: () => number): string => newId('fig', doc, random)

export interface FigurePatch {
  width?: string | null
  height?: string | null
  alt?: string | null
  /** The caption's source text (what goes between the brackets). */
  caption?: string | null
}

export interface TextEdit {
  from: number
  to: number
  insert: string
}

/** Sets, changes, or removes the named argument of the list `( … )` at `open` to `close`. */
export function setNamed(
  doc: string,
  open: number,
  close: number,
  name: string,
  value: string | null,
): TextEdit | null {
  const args = parseArgs(doc, open, close)
  const index = args.findIndex((a) => a.name === name)
  const existing = args[index]
  if (existing) {
    if (value !== null) return { from: existing.valueFrom, to: existing.valueTo, insert: value }
    const next = args[index + 1]
    const previous = args[index - 1]
    if (next) return { from: existing.from, to: next.from, insert: '' }
    if (previous) return { from: previous.to, to: existing.to, insert: '' }
    return { from: existing.from, to: existing.to, insert: '' }
  }
  if (value === null) return null
  const last = args[args.length - 1]
  if (!last) return { from: open + 1, to: open + 1, insert: `${name}: ${value}` }
  if (doc.slice(open, close).includes('\n')) {
    const lineStart = doc.lastIndexOf('\n', last.from) + 1
    const indent = /^[ \t]*/.exec(doc.slice(lineStart, last.from))![0]
    return { from: last.to, to: last.to, insert: `,\n${indent}${name}: ${value}` }
  }
  return { from: last.to, to: last.to, insert: `, ${name}: ${value}` }
}

const quoteValue = (value: string | null): string | null =>
  value === null ? null : typstString(value)

/**
 * Applies the changes to one figure and returns the smallest single edit that does it. Only the
 * arguments named in `patch` change. A caption with unbalanced brackets is refused (null).
 */
export function updateFigure(doc: string, figure: Figure, patch: FigurePatch): TextEdit | null {
  if (patch.caption != null && !balanced(patch.caption)) return null
  let text = doc
  const start = figure.from
  const find = (source: string): Figure | undefined =>
    scanFigures(parseTypst(source), source).find((f) => f.from === start)

  const apply = (edit: TextEdit | null): void => {
    if (edit) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  }
  const image = (name: string, value: string | null): void => {
    const current = find(text)
    if (!current) return
    const expression = text.slice(current.from, current.to)
    const argsOpen = expression.indexOf('(')
    const outer = parseArgs(text, current.from + argsOpen, current.to - 1)
    const call =
      current.kind === 'image'
        ? { open: current.from + argsOpen, close: current.to - 1 }
        : outer
            .map((a) => (a.name === null ? callIn(text, a.valueFrom, a.valueTo) : null))
            .find((c) => c?.name === 'image')
    if (call) apply(setNamed(text, call.open, call.close, name, value))
  }

  if ('width' in patch) image('width', patch.width ?? null)
  if ('height' in patch) image('height', patch.height ?? null)
  if ('alt' in patch) image('alt', quoteValue(patch.alt ?? null))
  if ('caption' in patch && figure.kind === 'figure') {
    const current = find(text)
    if (current) {
      const argsOpen = text.indexOf('(', current.from)
      apply(
        setNamed(
          text,
          argsOpen,
          current.to - 1,
          'caption',
          patch.caption == null ? null : `[${patch.caption}]`,
        ),
      )
    }
  }
  if (text === doc) return null
  // Trim what is the same at both ends, so the edit is as small as it can be.
  let from = 0
  while (from < doc.length && from < text.length && doc[from] === text[from]) from += 1
  let endOld = doc.length
  let endNew = text.length
  while (endOld > from && endNew > from && doc[endOld - 1] === text[endNew - 1]) {
    endOld -= 1
    endNew -= 1
  }
  return { from, to: endOld, insert: text.slice(from, endNew) }
}

/**
 * The edit that gives a figure another image, or its first one. The path (or, for a placeholder,
 * the frame) is the only text that changes: the label, the caption, and the other arguments stay,
 * so references to the figure stay correct. A first image gets the default width.
 */
export function replaceFigureImage(figure: Figure, path: string, width?: string): TextEdit {
  const call = `image(${[typstString(path), ...(figure.empty && width ? [`width: ${width}`] : [])].join(', ')})`
  return figure.empty
    ? { from: figure.pathFrom, to: figure.pathTo, insert: call }
    : { from: figure.pathFrom, to: figure.pathTo, insert: typstString(path) }
}

/**
 * The edit that removes a figure. A figure that stands on its own lines takes its lines with it,
 * and one of the blank lines around it, so no gap is left. Anything else only loses its own text.
 */
export function removeFigure(doc: string, figure: Figure): TextEdit {
  const lineStart = doc.lastIndexOf('\n', figure.from - 1) + 1
  const nl = doc.indexOf('\n', figure.end)
  const lineEnd = nl < 0 ? doc.length : nl
  const alone =
    doc.slice(lineStart, figure.from).trim() === '' && doc.slice(figure.end, lineEnd).trim() === ''
  if (!alone) return { from: figure.from, to: figure.end, insert: '' }
  // Take the line break after the figure and the blank line that follows it, or the one before it.
  let to = nl < 0 ? doc.length : nl + 1
  if (
    nl >= 0 &&
    doc.slice(to, doc.indexOf('\n', to) < 0 ? doc.length : doc.indexOf('\n', to)).trim() === ''
  ) {
    const next = doc.indexOf('\n', to)
    to = next < 0 ? doc.length : next + 1
    return { from: lineStart, to, insert: '' }
  }
  let from = lineStart
  if (from >= 2 && doc[from - 1] === '\n' && doc[from - 2] === '\n') from -= 1
  return { from, to, insert: '' }
}
