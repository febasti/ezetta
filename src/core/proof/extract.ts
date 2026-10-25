import type { Tree } from '@lezer/common'
import { citationGroups, scanCitations } from '../typst/citations'
import { RESERVED_PREFIX, scanCrossRefs } from '../typst/targets'
import type { CrossRef } from '../typst/targets'

/**
 * The checker's input, built from the parsed source. A sheet is cut into units (a
 * paragraph, a heading, a list item, the text of one footnote), and each unit is sent as an
 * annotation: runs of text, and runs of markup that the checker skips. Markup may stand in for
 * words with `interpretAs`, so the grammar around a citation, a cross-reference, or a formula stays
 * right. The runs cover the unit's source exactly, so the checker's offsets are offsets in the
 * source and need no mapping.
 */

export type AnnotationPart = { text: string } | { markup: string; interpretAs?: string }

export interface ProofUnit {
  /** The unit's extent in the source. */
  from: number
  to: number
  annotation: AnnotationPart[]
  /** The unit is the text of a footnote. */
  footnote: boolean
}

export interface StandIns {
  /** What citations that print together stand for in the sentence, for example "Smith 2020". */
  citation: (keys: readonly string[]) => string
  /** What a cross-reference stands for, for example "Abbildung 3". */
  reference: (ref: CrossRef) => string
}

/** Marks and wrappers: nothing in them is prose. */
const MARKUP_NODES = new Set([
  'HeadingMark',
  'ListMark',
  'EmphasisMark',
  'StrongMark',
  'HighlightMark',
  'ContentMark',
  'Hash',
  'FuncName',
  'Args',
  'LineComment',
  'BlockComment',
  'Label',
  'CodeLine',
  'CodeBlock',
])

/** The neutral word an inline formula stands for. */
export const FORMULA_STAND_IN = 'x'
export const LINK_STAND_IN = 'Link'
export const CODE_STAND_IN = 'Code'

interface Atom {
  from: number
  to: number
  /** What the run stands for, or null when it stands for nothing. */
  as: string | null
}

interface Region {
  from: number
  to: number
  /** The text of the note between its brackets. */
  inner: [number, number]
}

/** The longest unit sent to the checker, in characters, and the shortest piece a long one is cut into. */
export const MAX_UNIT = 1500
const MIN_PIECE = 400

const isBlank = (text: string): boolean => /^\s*$/.test(text)

export function proofUnits(tree: Tree, doc: string, standIns: StandIns): ProofUnit[] {
  const atoms: Atom[] = []
  const regions: Region[] = []
  const boundaries = new Set<number>()

  // Citations and references first: they claim their whole extent, whatever is inside it.
  const citations = scanCitations(tree, doc)
  for (const group of citationGroups(citations, doc)) {
    atoms.push({
      from: group[0]!.from,
      to: group[group.length - 1]!.end,
      as: standIns.citation(group.map((c) => c.key)),
    })
  }
  for (const ref of scanCrossRefs(tree, doc))
    atoms.push({ from: ref.from, to: ref.to, as: standIns.reference(ref) })

  tree.iterate({
    enter: (ref) => {
      const { name, from, to } = ref
      if (name === 'Heading' || name === 'ListItem') {
        boundaries.add(from)
        boundaries.add(to)
        return undefined
      }
      if (name === 'Expression') {
        const fn = ref.node.getChild('FuncName')
        if (fn && doc.slice(fn.from, fn.to) === 'footnote') {
          const content = ref.node.getChild('Content')
          // The note is markup in the text around it, and a stretch of its own inside.
          if (content) regions.push({ from, to, inner: [content.from + 1, content.to - 1] })
        }
        return undefined
      }
      if (MARKUP_NODES.has(name)) {
        atoms.push({ from, to, as: null })
        return false
      }
      switch (name) {
        case 'Url':
          atoms.push({ from, to, as: LINK_STAND_IN })
          return false
        case 'Math': {
          const inner = doc.slice(from + 1, to - 1)
          const display = inner.trim() !== '' && /^\s/.test(inner) && /\s$/.test(inner)
          atoms.push({ from, to, as: display ? null : FORMULA_STAND_IN })
          return false
        }
        case 'Raw':
          atoms.push({
            from,
            to,
            as: doc.slice(from, to).includes('\n') ? null : CODE_STAND_IN,
          })
          return false
        case 'Escape':
          atoms.push({ from, to, as: doc.slice(from + 1, to) })
          return false
        case 'Ref': {
          // Citations and references in the text are claimed above; this is one in a note, which
          // the scan of the text leaves out.
          const supplement = ref.node.getChild('Supplement')
          const key = doc.slice(from + 1, supplement ? supplement.from : to)
          atoms.push({
            from,
            to,
            as: RESERVED_PREFIX.test(key)
              ? standIns.reference({ from, to, label: key, supplement: null, long: false })
              : standIns.citation([key]),
          })
          return false
        }
        default:
          return undefined
      }
    },
  })

  // Larger claims win over what lies inside them.
  atoms.sort((a, b) => a.from - b.from || b.to - a.to)
  const claimed: Atom[] = []
  for (const atom of atoms) {
    const last = claimed.at(-1)
    if (last && atom.from < last.to) continue
    claimed.push(atom)
  }
  regions.sort((a, b) => a.from - b.from || b.to - a.to)

  const out: ProofUnit[] = []
  streamUnits(0, doc.length, false)
  return out.sort((a, b) => a.from - b.from)

  /** The units of one stretch of the source: the text, or the inside of one footnote. */
  function streamUnits(start: number, end: number, footnote: boolean): void {
    // The notes directly inside this stretch: they are markup here, and streams of their own.
    const nested: Region[] = []
    for (const region of regions) {
      if (region.from < start || region.to > end) continue
      if (region.from === start && region.to === end) continue
      const last = nested.at(-1)
      if (last && region.from < last.to) continue
      nested.push(region)
    }
    const inNested = (pos: number): boolean => nested.some((r) => r.from < pos && pos < r.to)
    const here: Atom[] = []
    for (const atom of claimed) {
      // What sticks out of this stretch (the note around its own text) is not part of it.
      if (atom.from < start || atom.to > end) continue
      if (inNested(atom.from) || nested.some((r) => r.from === atom.from)) continue
      here.push(atom)
    }
    for (const region of nested) here.push({ from: region.from, to: region.to, as: null })
    here.sort((a, b) => a.from - b.from)

    const insideMarkup = (pos: number): boolean =>
      here.some((a) => a.from < pos && pos < a.to && a.as === null)
    const cuts = new Set<number>([start, end])
    for (const at of boundaries) if (at > start && at < end && !insideMarkup(at)) cuts.add(at)
    // A blank line ends a paragraph.
    const blank = /\n[ \t]*(?:\r?\n[ \t]*)+/g
    blank.lastIndex = start
    for (let m = blank.exec(doc); m && m.index < end; m = blank.exec(doc)) {
      const at = m.index
      if (at >= start && !insideMarkup(at) && !inNested(at)) {
        cuts.add(at)
        cuts.add(Math.min(end, m.index + m[0].length))
      }
    }
    const points = splitLong(
      [...cuts].sort((a, b) => a - b),
      here,
    )
    for (let i = 0; i + 1 < points.length; i += 1) {
      const unit = unitBetween(here, points[i]!, points[i + 1]!, footnote)
      if (unit) out.push(unit)
    }
    for (const region of nested)
      if (region.inner[1] > region.inner[0]) streamUnits(region.inner[0], region.inner[1], true)
  }

  /**
   * A paragraph longer than `MAX_UNIT` characters is cut into pieces at the ends of sentences (at a
   * space when a sentence is itself that long), never inside markup or a stand-in: the checker takes a long text
   * much longer than its parts together, and a request that takes too long fails as a whole.
   */
  function splitLong(points: number[], here: readonly Atom[]): number[] {
    const insideAtom = (pos: number): boolean => here.some((a) => a.from < pos && pos < a.to)
    const out: number[] = []
    for (let i = 0; i < points.length; i += 1) {
      out.push(points[i]!)
      const next = points[i + 1]
      if (next === undefined || next - points[i]! <= MAX_UNIT) continue
      let last = points[i]!
      while (next - last > MAX_UNIT) {
        const limit = last + MAX_UNIT
        let cut = -1
        let spaced = -1
        for (let at = last + MIN_PIECE; at < limit; at += 1) {
          if (insideAtom(at)) continue
          if (/\s/.test(doc[at]!)) {
            spaced = at
            if (/[.!?…]/.test(doc[at - 1] ?? '') || /["»“”)\]]/.test(doc[at - 1] ?? '')) cut = at
          }
        }
        const at = cut >= 0 ? cut : spaced >= 0 ? spaced : limit
        out.push(at)
        last = at
      }
    }
    return out
  }
  function unitBetween(
    here: readonly Atom[],
    from: number,
    to: number,
    footnote: boolean,
  ): ProofUnit | null {
    // White space at the edges is not part of the unit (unless it is inside a run of markup).
    const covered = (pos: number): boolean => here.some((a) => a.from <= pos && pos < a.to)
    while (from < to && /\s/.test(doc[from]!) && !covered(from)) from += 1
    while (to > from && /\s/.test(doc[to - 1]!) && !covered(to - 1)) to -= 1
    const annotation: AnnotationPart[] = []
    let prose = false
    const addText = (a: number, b: number): void => {
      if (b <= a) return
      const text = doc.slice(a, b)
      if (!isBlank(text)) prose = true
      const last = annotation.at(-1)
      if (last && 'text' in last) last.text += text
      else annotation.push({ text })
    }
    let at = from
    for (const atom of here) {
      if (atom.to <= from || atom.from >= to) continue
      // An atom that sticks out of the unit would break the offsets: cut the unit there.
      const a = Math.max(atom.from, from)
      const b = Math.min(atom.to, to)
      addText(at, a)
      const markup = doc.slice(a, b)
      const stand = a === atom.from && b === atom.to ? atom.as : null
      const last = annotation.at(-1)
      if (stand) {
        annotation.push({ markup, interpretAs: stand })
        prose = true
      } else if (last && 'markup' in last && last.interpretAs === undefined) last.markup += markup
      else annotation.push({ markup })
      at = b
    }
    addText(at, to)
    if (!prose) return null
    return { from, to, annotation, footnote }
  }
}
