import { LINE_SECTIONS, PROP_SECTIONS } from '@core/export/elements'
import type { ElementDef } from '@core/export/elements'

/**
 * Small schematic drawings in the properties of the template editor. A drawing is abstract on
 * purpose (grey bars for text, a little landscape for a picture, never real text or the template's
 * fonts), so it cannot be taken for the page itself: that is the preview's job. It shows what a
 * value means: the gap a value sets is marked in it, and the value's field stands on the side of
 * the drawing that gap is on, with a short name under it. A drawing follows the choices (one page or
 * two, upright or across, the columns, where a caption stands, which rules a table has), never the
 * sizes: a margin of 5 cm is drawn as wide as one of 2 cm.
 */

/**
 * Where a field stands around the drawing: above, below, left, right, or at a corner; or in a row
 * of its own over all of it (`a1`, `a2`, `a3`, standing over the left side, the drawing, and the
 * right side), for choices that change the whole drawing.
 */
export type Place = 't' | 'b' | 'l' | 'r' | 'tl' | 'tr' | 'bl' | 'br' | 'a1' | 'a2' | 'a3'

/** Whether a place is in the row over the drawing. */
export const isAbove = (place: string): boolean => place.startsWith('a')

/** The values of an element, as the style resolves them. */
export type Values = Readonly<Record<string, unknown>>

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A shape of a drawing, 128 wide. */
export type Shape =
  /** Paper: white, with a hairline. */
  | ({ kind: 'sheet' } & Rect)
  /** A bar: a line of text (`text`), a heading or a caption (`strong`), a coloured ground (`tint`). */
  | ({ kind: 'bar'; tone?: 'text' | 'strong' | 'tint' } & Rect)
  /** A picture: a little landscape in a box. */
  | ({ kind: 'picture' } & Rect)
  /** A line drawn in the document (a rule, a border), solid, dashed or dotted. */
  | {
      kind: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      style?: 'solid' | 'dashed' | 'dotted'
      weight?: number
      faint?: boolean
    }
  /** An outline: a frame, a box; `dashed` for a place that is only a place. */
  | ({ kind: 'box'; r?: number; dashed?: boolean; faint?: boolean } & Rect)
  /** Room that is taken but not printed on, hatched: what the binding takes. */
  | ({ kind: 'hatch' } & Rect)
  /** The bullet of a list item. */
  | { kind: 'marker'; x: number; y: number; shape: 'dot' | 'ring' | 'square' | 'dash' | 'triangle' }

/** What a value is about in a drawing. */
export type Mark =
  /** A distance across (`h`) or down (`v`), with ends, and the band it spans lit when pointed at. */
  | { prop: string; kind: 'h' | 'v'; x: number; y: number; len: number; band?: Rect }
  /** A side that is on or off (a line): drawn when on, dashed when off. */
  | { prop: string; kind: 'edge'; x1: number; y1: number; x2: number; y2: number; on: boolean }
  /** A line whose weight is set: lit over the line when pointed at. */
  | { prop: string; kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  /** A corner whose radius is set. */
  | { prop: string; kind: 'corner'; x: number; y: number; r: number }
  /** A part of the drawing that a value names (the text before a number). */
  | ({ prop: string; kind: 'area' } & Rect)

export interface Drawing {
  /** The height of the drawing. */
  h: number
  /** Its width; 128 unless it says (the page has more room, since it is the main thing of its panel). */
  w?: number
  shapes: Shape[]
  marks: Mark[]
}

type Words = string | ((v: Values) => string)
export interface Field {
  prop: string
  de: Words
  en: Words
}

export interface Schematic {
  /** The drawing for the element's values. */
  draw: (v: Values) => Drawing
  /** The field of each value, by where it stands, with its short name. The first decides the group. */
  places: Readonly<Partial<Record<Place, Field>>>
}

const at = (prop: string, de: Words, en: Words): Field => ({ prop, de, en })
export const words = (w: Words, v: Values): string => (typeof w === 'string' ? w : w(v))

/** Lines of text, one under another, each as wide as given (a fraction of `w`). */
const lines = (x: number, y: number, w: number, widths: number[], gap = 7): Shape[] =>
  widths.map((f, i) => ({ kind: 'bar', x, y: y + i * gap, w: Math.round(w * f), h: 3 }))

const W = 128
/** The paper of a drawing, and the text on it: from TL to TR. */
const sheet = (h: number): Shape => ({ kind: 'sheet', x: 10, y: 6, w: 108, h: h - 12 })
const TL = 20
const TR = 108
const TW = TR - TL

/** Whether a length is more than nothing. */
const some = (v: unknown): boolean =>
  typeof v === 'string' && v.trim() !== '' && !/^[0.]*[a-z%]*$/i.test(v.trim())
const filled = (v: unknown): boolean => typeof v === 'string' && v !== ''
/** A length in centimetres, or null. */
function cm(v: unknown): number | null {
  const m = typeof v === 'string' ? /^\s*([\d.]+)\s*(cm|mm|in|pt)\s*$/.exec(v) : null
  if (!m) return null
  const n = Number(m[1])
  return m[2] === 'mm' ? n / 10 : m[2] === 'in' ? n * 2.54 : m[2] === 'pt' ? n / 28.35 : n
}
const PAPERS: Readonly<Record<string, readonly [number, number]>> = {
  a3: [29.7, 42],
  a4: [21, 29.7],
  a5: [14.8, 21],
  b5: [17.6, 25],
  'us-letter': [21.59, 27.94],
  'us-legal': [21.59, 35.56],
}
/** The width and height of the paper in centimetres. */
function paper(v: Values): [number, number] {
  const [w, h] = PAPERS[v['paper'] as string] ?? PAPERS['a4']!
  if (v['paper'] === 'custom') return [cm(v['page_width']) ?? w, cm(v['page_height']) ?? h]
  return v['orientation'] === 'landscape' ? [h, w] : [w, h]
}
/** The width of the text on a page in centimetres: the paper less its inside and outside margins. */
export function measureCm(page: Values): number {
  const [w] = paper(page)
  return Math.max(2, w - (cm(page['margin_inside']) ?? 0) - (cm(page['margin_outside']) ?? 0))
}
/** A length in centimetres, an `em` counted as `emCm`; null for anything else (a percentage). */
export function lengthCm(v: unknown, emCm: number): number | null {
  const m = typeof v === 'string' ? /^\s*([\d.]+)\s*em\s*$/.exec(v) : null
  return m ? Number(m[1]) * emCm : cm(v)
}
/** How much of the text's width a length takes, 0 to 1: a percentage, or centimetres over the measure. */
export function shareOf(v: unknown, measure: number, emCm: number): number {
  const percent = typeof v === 'string' ? /^\s*([\d.]+)\s*%\s*$/.exec(v) : null
  const share = percent ? Number(percent[1]) / 100 : (lengthCm(v, emCm) ?? measure) / measure
  return Math.min(1, Math.max(0.03, share))
}
/** The thickness of a line as drawn, in whole pixels from one to four: it shows heavier from lighter, not how heavy. */
export function thicknessPx(v: unknown, emCm: number): number {
  const points = (lengthCm(v, emCm) ?? 0.5 / 28.35) * 28.35
  return Math.min(4, Math.max(1, Math.round(points * 1.5)))
}
/** The width of the paper over its height. */
function ratio(v: Values): number {
  const [w, h] = paper(v)
  return Math.min(2.5, Math.max(0.4, w / h))
}
const align = (v: unknown, inner: number, outer: number, start: number): number =>
  Math.round(
    v === 'center' ? start + (outer - inner) / 2 : v === 'right' ? start + outer - inner : start,
  )
const band = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/**
 * The page: one or two pages in their proportions, the text in columns, the margins marked. The
 * binding offset of the document (`binding`, set in the document's own settings, not here) is a
 * hatched strip at the inner edge, in its proportion to the paper, that moves the text out.
 */
const PAGE: Schematic = {
  draw(v) {
    // The page is the main thing of its panel, so it is drawn larger than the other drawings.
    const w = 176
    const h = 128
    const facing = v['facing'] !== 'single'
    const n = facing ? 2 : 1
    const r = ratio(v)
    const ph = Math.round(Math.min(112, (w - 16) / (n * r)))
    const pw = Math.round(ph * r)
    const x0 = Math.round((w - n * pw) / 2)
    const y = Math.round((h - ph) / 2)
    // The lines of text, as many as the page's height allows.
    const lineGap = Math.max(4, Math.round(ph / 20))
    const lineHeight = Math.max(1.5, lineGap * 0.4)
    const top = Math.max(4, Math.round(ph * 0.13))
    const bottom = Math.max(4, Math.round(ph * 0.15))
    const inside = Math.max(4, Math.round(pw * 0.17))
    const outside = Math.max(3, Math.round(pw * 0.12))
    const columns = Math.max(1, Number(v['columns']) || 1)
    const gap = Math.max(3, Math.round(pw * 0.07))
    const offset = cm(v['binding'])
    const bind = offset
      ? Math.min(Math.round(pw * 0.2), Math.max(2, Math.round((pw * offset) / paper(v)[0])))
      : 0
    const shapes: Shape[] = []
    const marks: Mark[] = []
    for (let i = 0; i < n; i += 1) {
      const x = x0 + i * pw
      const innerLeft = !(facing && i === 0)
      const left = innerLeft ? inside + bind : outside
      const right = innerLeft ? outside : inside + bind
      const tw = pw - left - right
      const cw = (tw - gap * (columns - 1)) / columns
      shapes.push({ kind: 'sheet', x, y, w: pw, h: ph })
      // The strip inside the paper's hairline.
      if (bind > 0)
        shapes.push({
          kind: 'hatch',
          x: innerLeft ? x + 1 : x + pw - bind,
          y: y + 1,
          w: bind - 1,
          h: ph - 2,
        })
      for (let c = 0; c < columns; c += 1)
        for (let ly = y + top; ly + lineHeight <= y + ph - bottom; ly += lineGap)
          shapes.push({ kind: 'bar', x: x + left + c * (cw + gap), y: ly, w: cw, h: lineHeight })
      if (i < n - 1) continue
      // The marks are on the right page (or the only one): its inner margin is at its left, after
      // the binding.
      const mx = Math.round(x + left + tw * 0.3)
      const my = y + Math.round(ph / 2)
      marks.push(
        { prop: 'margin_top', kind: 'v', x: mx, y, len: top, band: band(x, y, pw, top) },
        {
          prop: 'margin_bottom',
          kind: 'v',
          x: mx,
          y: y + ph - bottom,
          len: bottom,
          band: band(x, y + ph - bottom, pw, bottom),
        },
        {
          prop: 'margin_inside',
          kind: 'h',
          x: x + bind,
          y: my,
          len: inside,
          band: band(x + bind, y, inside, ph),
        },
        {
          prop: 'margin_outside',
          kind: 'h',
          x: x + pw - right,
          y: my,
          len: right,
          band: band(x + pw - right, y, right, ph),
        },
      )
      if (columns > 1)
        marks.push({
          prop: 'column_gap',
          kind: 'h',
          x: Math.round(x + left + cw),
          y: y + Math.round(ph * 0.3),
          len: gap,
          band: band(x + left + cw, y + top, gap, ph - top - bottom),
        })
    }
    return { h, w, shapes, marks }
  },
  places: {
    t: at('margin_top', 'oben', 'top'),
    b: at('margin_bottom', 'unten', 'bottom'),
    l: at(
      'margin_inside',
      (v) => (v['facing'] === 'single' ? 'links' : 'innen'),
      (v) => (v['facing'] === 'single' ? 'left' : 'inside'),
    ),
    r: at(
      'margin_outside',
      (v) => (v['facing'] === 'single' ? 'rechts' : 'außen'),
      (v) => (v['facing'] === 'single' ? 'right' : 'outside'),
    ),
    // The choices that change the whole page in a row over it.
    a1: at('facing', 'Seiten', 'pages'),
    a3: at('columns', 'Spalten', 'columns'),
    br: at('column_gap', 'Spaltenabstand', 'column gap'),
  },
}

/** A paper of its own size: its proportions, width and height marked. */
const PAPER_SIZE: Schematic = {
  draw(v) {
    const h = 76
    const r = ratio(v)
    const ph = Math.round(Math.min(56, 96 / r))
    const pw = Math.round(ph * r)
    const x = Math.round((W - pw) / 2) + 4
    const y = Math.round((h - ph) / 2) + 4
    return {
      h,
      shapes: [{ kind: 'sheet', x, y, w: pw, h: ph }],
      marks: [
        { prop: 'page_width', kind: 'h', x, y: y - 6, len: pw, band: band(x, y, pw, ph) },
        { prop: 'page_height', kind: 'v', x: x - 7, y, len: ph, band: band(x, y, pw, ph) },
      ],
    }
  },
  places: { t: at('page_width', 'Breite', 'width'), l: at('page_height', 'Höhe', 'height') },
}

/** A block quote between text: its indents and the space around it, with its lines and ground. */
const QUOTE_SPACE: Schematic = {
  draw(v) {
    const h = 80
    const [x1, x2, y1, y2] = [32, 96, 29, 52]
    const shapes: Shape[] = [sheet(h), ...lines(TL, 12, TW, [1, 0.8])]
    if (filled(v['fill']))
      shapes.push({ kind: 'bar', tone: 'tint', ...band(x1, y1, x2 - x1, y2 - y1) })
    shapes.push(...lines(x1 + 6, y1 + 5, x2 - x1 - 12, [1, 1, 0.6]))
    for (const [side, [a, b, c, d]] of [
      ['border_top', [x1, y1, x2, y1]],
      ['border_bottom', [x1, y2, x2, y2]],
      ['border_left', [x1, y1, x1, y2]],
      ['border_right', [x2, y1, x2, y2]],
    ] as const)
      if (v[side] === true) shapes.push({ kind: 'line', x1: a, y1: b, x2: c, y2: d, weight: 1.5 })
    shapes.push(...lines(TL, 61, TW, [1, 0.5]))
    return {
      h,
      shapes,
      marks: [
        {
          prop: 'indent_left',
          kind: 'h',
          x: TL,
          y: 40,
          len: x1 - TL,
          band: band(TL, y1, x1 - TL, y2 - y1),
        },
        {
          prop: 'indent_right',
          kind: 'h',
          x: x2,
          y: 40,
          len: TR - x2,
          band: band(x2, y1, TR - x2, y2 - y1),
        },
        { prop: 'above', kind: 'v', x: 64, y: 22, len: y1 - 22, band: band(TL, 22, TW, y1 - 22) },
        { prop: 'below', kind: 'v', x: 64, y: y2, len: 61 - y2, band: band(TL, y2, TW, 61 - y2) },
      ],
    }
  },
  places: {
    t: at('above', 'davor', 'above'),
    b: at('below', 'danach', 'below'),
    l: at('indent_left', 'links', 'left'),
    r: at('indent_right', 'rechts', 'right'),
  },
}

/** The lines around a block quote: a switch for each side, their weight, the room inside. */
const QUOTE_LINES: Schematic = {
  draw(v) {
    const h = 70
    const [x1, x2, y1, y2] = [32, 96, 12, 58]
    return {
      h,
      shapes: [
        sheet(h),
        ...(filled(v['fill'])
          ? [{ kind: 'bar' as const, tone: 'tint' as const, ...band(x1, y1, x2 - x1, y2 - y1) }]
          : []),
        ...lines(x1 + 9, y1 + 10, x2 - x1 - 18, [1, 1, 1, 0.6]),
      ],
      marks: [
        { prop: 'border_top', kind: 'edge', x1, y1, x2, y2: y1, on: v['border_top'] === true },
        {
          prop: 'border_bottom',
          kind: 'edge',
          x1,
          y1: y2,
          x2,
          y2,
          on: v['border_bottom'] === true,
        },
        { prop: 'border_left', kind: 'edge', x1, y1, x2: x1, y2, on: v['border_left'] === true },
        { prop: 'border_right', kind: 'edge', x1: x2, y1, x2, y2, on: v['border_right'] === true },
        { prop: 'border_thickness', kind: 'line', x1: x1 + 16, y1, x2: x2 - 16, y2: y1 },
        { prop: 'border_gap', kind: 'h', x: x1, y: 35, len: 9, band: band(x1, y1, 9, y2 - y1) },
        { prop: 'padding', kind: 'v', x: 86, y: y1, len: 10, band: band(x1, y1, x2 - x1, 10) },
      ],
    }
  },
  places: {
    t: at('border_top', 'oben', 'top'),
    b: at('border_bottom', 'unten', 'bottom'),
    l: at('border_left', 'links', 'left'),
    r: at('border_right', 'rechts', 'right'),
    tr: at('border_thickness', 'Stärke', 'weight'),
    bl: at('border_gap', 'zum Text', 'to the text'),
    br: at('padding', 'innen', 'inside'),
  },
}

/** A list: its indents, the gap after a bullet, the space between items and around the list. */
const LIST: Schematic = {
  draw(v) {
    const h = 76
    const marker = (v['marker'] as string) ?? 'default'
    const shape = (level: number) =>
      marker === 'bullet'
        ? 'dot'
        : marker === 'circle'
          ? 'ring'
          : marker === 'square'
            ? 'square'
            : marker === 'dash'
              ? 'dash'
              : level === 1
                ? 'triangle'
                : 'dot'
    // Each bullet fills the three pixels from its left edge (m1, m2). Each distance runs on the row
    // of an item of its own and ends right at the bullet or the text: the list's indent on the first
    // (|—|•), a level's on the second, the gap to the text on the third (•|—|text).
    const m1 = TL + 8
    const t1 = m1 + 3 + 7
    const m2 = t1 + 8
    const t2 = m2 + 3 + 7
    const row = (y: number) => y + 1
    return {
      h,
      shapes: [
        sheet(h),
        ...lines(TL, 11, TW, [1]),
        { kind: 'marker', x: m1 + 1.5, y: row(21) + 0.5, shape: shape(0) },
        { kind: 'bar', x: t1, y: 21, w: 68, h: 3 },
        { kind: 'marker', x: m2 + 1.5, y: row(32) + 0.5, shape: shape(1) },
        { kind: 'bar', x: t2, y: 32, w: TR - 6 - t2, h: 3 },
        { kind: 'marker', x: m1 + 1.5, y: row(43) + 0.5, shape: shape(0) },
        { kind: 'bar', x: t1, y: 43, w: TR - t1, h: 3 },
        ...lines(TL, 57, TW, [1, 0.6]),
      ],
      marks: [
        {
          prop: 'list_indent',
          kind: 'h',
          x: TL,
          y: row(21),
          len: m1 - TL,
          band: band(TL, 19, m1 - TL, 29),
        },
        {
          prop: 'marker_gap',
          kind: 'h',
          x: m1 + 3,
          y: row(43),
          len: t1 - m1 - 3,
          band: band(m1 + 3, 41, t1 - m1 - 3, 7),
        },
        {
          prop: 'level_indent',
          kind: 'h',
          x: t1,
          y: row(32),
          len: m2 - t1,
          band: band(t1, 30, m2 - t1, 7),
        },
        { prop: 'item_spacing', kind: 'v', x: 103, y: 24, len: 8, band: band(t1, 24, TR - t1, 8) },
        { prop: 'above', kind: 'v', x: 113, y: 14, len: 7, band: band(TL, 14, TW, 7) },
        { prop: 'below', kind: 'v', x: 113, y: 46, len: 11, band: band(TL, 46, TW, 11) },
      ],
    }
  },
  places: {
    tl: at('marker_gap', 'zum Text', 'to the text'),
    l: at('list_indent', 'Liste', 'list'),
    bl: at('level_indent', 'je Ebene', 'per level'),
    r: at('item_spacing', 'Punkte', 'items'),
    tr: at('above', 'davor', 'above'),
    br: at('below', 'danach', 'below'),
  },
}

/** A figure between text: the space around it, where it stands, its frame when it has one. */
const FIGURE_SPACE: Schematic = {
  draw(v) {
    const h = 80
    const [pw, ph, py] = [42, 27, 27]
    const px = align(v['align'], pw, TW, TL)
    const framed = some(v['frame_width'])
    const shapes: Shape[] = [sheet(h), ...lines(TL, 11, TW, [1, 0.75])]
    const d = framed ? 3 : 0
    if (framed)
      shapes.push({
        kind: 'box',
        x: px - d,
        y: py - d,
        w: pw + 2 * d,
        h: ph + 2 * d,
        r: some(v['frame_radius']) ? 3 : 0,
      })
    shapes.push({ kind: 'picture', x: px, y: py, w: pw, h: ph }, ...lines(TL, 64, TW, [1, 0.55]))
    const [top, bottom] = [py - d, py + ph + d]
    return {
      h,
      shapes,
      marks: [
        {
          prop: 'above',
          kind: 'v',
          x: 113,
          y: 18,
          len: top - 18,
          band: band(TL, 18, TW, top - 18),
        },
        {
          prop: 'below',
          kind: 'v',
          x: 113,
          y: bottom,
          len: 64 - bottom,
          band: band(TL, bottom, TW, 64 - bottom),
        },
      ],
    }
  },
  places: {
    tr: at('above', 'davor', 'above'),
    br: at('below', 'danach', 'below'),
    l: at('align', 'Ausrichtung', 'alignment'),
    bl: at('span_columns', 'alle Spalten', 'all columns'),
  },
}

/** The frame of a picture: its weight, its corners, its distance from the picture. */
const FRAME: Schematic = {
  draw(v) {
    const h = 68
    const framed = some(v['frame_width'])
    const r = some(v['frame_radius']) ? 7 : 0
    const d = some(v['frame_distance']) ? 6 : 0
    const [x1, y1, w, hh] = [34, 8, 60, 52]
    return {
      h,
      shapes: [
        { kind: 'picture', x: x1 + d, y: y1 + d, w: w - 2 * d, h: hh - 2 * d },
        { kind: 'box', x: x1, y: y1, w, h: hh, r, dashed: !framed, faint: !framed },
      ],
      marks: [
        { prop: 'frame_width', kind: 'line', x1: x1 + 14, y1, x2: x1 + w - 14, y2: y1 },
        { prop: 'frame_radius', kind: 'corner', x: x1 + w, y: y1, r: 7 },
        {
          prop: 'frame_distance',
          kind: 'h',
          x: x1,
          y: y1 + hh / 2,
          len: Math.max(d, 4),
          band: band(x1, y1, Math.max(d, 4), hh),
        },
      ],
    }
  },
  places: {
    t: at('frame_width', 'Stärke', 'weight'),
    tr: at('frame_radius', 'Ecken', 'corners'),
    l: at('frame_distance', 'Abstand', 'distance'),
  },
}

/** A caption with what it belongs to: above or below it, how wide, how set, how far from it. */
const caption = (table: boolean): Schematic => ({
  draw(v) {
    const h = 66
    const above = v['caption_position'] === 'above'
    const fit = v['caption_fit'] === true
    const [ow, oh] = [46, 26]
    const ox = Math.round(TL + (TW - ow) / 2)
    const [capW, capX] = fit ? [ow, ox] : [TW, TL]
    const [capY, objY] = above ? [12, 30] : [44, 12]
    const gapY = above ? 21 : objY + oh
    const gapLen = above ? objY - gapY : capY - gapY
    const shapes: Shape[] = [sheet(h)]
    if (table) {
      for (const [r, y] of [0, 9, 18].entries())
        for (const c of [0, 1, 2])
          shapes.push({
            kind: 'bar',
            x: ox + 3 + c * 15,
            y: objY + y + 3,
            w: 10,
            h: 2.5,
            tone: r === 0 ? 'strong' : 'text',
          })
      for (const y of [objY, objY + 9, objY + oh])
        shapes.push({ kind: 'line', x1: ox, y1: y + 0.5, x2: ox + ow, y2: y + 0.5 })
    } else shapes.push({ kind: 'picture', x: ox, y: objY, w: ow, h: oh })
    for (const [i, f] of [1, 0.6].entries()) {
      const w = Math.round(capW * f)
      shapes.push({
        kind: 'bar',
        x: align(v['align'] ?? 'center', w, capW, capX),
        y: capY + i * 6,
        w,
        h: 3,
        tone: 'strong',
      })
    }
    return {
      h,
      shapes,
      marks: [
        {
          prop: 'caption_gap',
          kind: 'v',
          x: 113,
          y: gapY,
          len: gapLen,
          band: band(TL, gapY, TW, gapLen),
        },
      ],
    }
  },
  places: {
    t: at('caption_position', 'Stellung', 'position'),
    r: at('caption_gap', 'Abstand', 'distance'),
    l: at('align', 'Ausrichtung', 'alignment'),
    b: at(
      'caption_fit',
      table ? 'so breit wie die Tabelle' : 'so breit wie das Bild',
      table ? 'as wide as the table' : 'as wide as the picture',
    ),
  },
})

/** A table: its rules, the ground of its header and stripes, the room in a cell. */
const TABLE: Schematic = {
  draw(v) {
    const h = 70
    const style = (v['border_style'] as string) ?? 'rows'
    const [x1, x2] = [24, 104]
    const ys = [11, 25, 39, 53]
    const cw = (x2 - x1) / 3
    const shapes: Shape[] = [sheet(h)]
    if (filled(v['header_fill']))
      shapes.push({ kind: 'bar', tone: 'tint', ...band(x1, ys[0]!, x2 - x1, 14) })
    if (filled(v['stripe_fill']))
      shapes.push({ kind: 'bar', tone: 'tint', ...band(x1, ys[2]!, x2 - x1, 14) })
    for (const [r, y] of ys.slice(0, 3).entries())
      for (const c of [0, 1, 2]) {
        const w = r === 0 ? 14 : 11
        shapes.push({
          kind: 'bar',
          x: align(v['cell_align'], w, cw - 12, x1 + c * cw + 6),
          y: y + 5.5,
          w,
          h: 3,
          tone: r === 0 && v['header_bold'] === true ? 'strong' : 'text',
        })
      }
    const rule = (y: number, weight = 1) =>
      shapes.push({ kind: 'line', x1, y1: y + 0.5, x2, y2: y + 0.5, weight })
    if (style === 'rows') ys.forEach((y, i) => rule(y, i === 1 ? 1.5 : 1))
    if (style === 'booktabs') {
      rule(ys[0]!, 1.5)
      rule(ys[1]!)
      rule(ys[3]!, 1.5)
    }
    if (style === 'grid') {
      ys.forEach((y) => rule(y))
      for (const x of [x1, x1 + cw, x1 + 2 * cw, x2])
        shapes.push({
          kind: 'line',
          x1: Math.round(x) + 0.5,
          y1: ys[0]!,
          x2: Math.round(x) + 0.5,
          y2: ys[3]!,
        })
    }
    return {
      h,
      shapes,
      marks: [
        { prop: 'rule_strong_width', kind: 'line', x1, y1: ys[1]! + 0.5, x2, y2: ys[1]! + 0.5 },
        { prop: 'rule_width', kind: 'line', x1, y1: ys[2]! + 0.5, x2, y2: ys[2]! + 0.5 },
        { prop: 'inset', kind: 'h', x: x1, y: 61, len: 6, band: band(x1, ys[1]!, 6, 28) },
      ],
    }
  },
  places: {
    t: at('border_style', 'Linien', 'rules'),
    tr: at('rule_strong_width', 'unter dem Kopf', 'under the header'),
    br: at('rule_width', 'übrige', 'others'),
    b: at('inset', 'Zellen innen', 'cell padding'),
    l: at('cell_align', 'Ausrichtung', 'alignment'),
    bl: at('header_bold', 'Kopf fett', 'bold header'),
  },
}

/** Footnotes: at the foot of the page under a rule, or beside the text in the margin. */
const FOOTNOTES: Schematic = {
  draw(v) {
    const h = 78
    const shapes: Shape[] = [sheet(h)]
    const marks: Mark[] = []
    const note = (x: number, y: number, w: number) =>
      shapes.push(
        { kind: 'bar', x, y, w: 3, h: 3, tone: 'strong' },
        { kind: 'bar', x: x + 6, y, w, h: 3 },
        { kind: 'bar', x: x + 6, y: y + 6, w: Math.round(w * 0.7), h: 3 },
      )
    if (v['placement'] === 'margin') {
      const [tx2, mx1] = [74, 82]
      shapes.push(...lines(TL, 12, tx2 - TL, [1, 1, 1, 1, 1, 1, 1, 0.6]))
      shapes.push({ kind: 'bar', x: 58, y: 17, w: 2.5, h: 2.5, tone: 'strong' })
      note(mx1, 16, TR - mx1 - 6)
      note(mx1, 36, TR - mx1 - 6)
      marks.push(
        {
          prop: 'margin_gap',
          kind: 'h',
          x: tx2,
          y: 66,
          len: mx1 - tx2,
          band: band(tx2, 12, mx1 - tx2, 50),
        },
        {
          prop: 'margin_width',
          kind: 'h',
          x: mx1,
          y: 9,
          len: TR - mx1,
          band: band(mx1, 16, TR - mx1, 29),
        },
        { prop: 'note_gap', kind: 'v', x: 113, y: 25, len: 11, band: band(mx1, 25, TR - mx1, 11) },
      )
    } else {
      shapes.push(...lines(TL, 12, TW, [1, 0.8]))
      shapes.push({
        kind: 'bar',
        x: TL + Math.round(TW * 0.8) + 1,
        y: 17,
        w: 2.5,
        h: 2.5,
        tone: 'strong',
      })
      const style = (v['separator_style'] as string) ?? 'solid'
      if (style !== 'none')
        shapes.push({
          kind: 'line',
          x1: TL,
          y1: 33.5,
          x2: TL + 32,
          y2: 33.5,
          style: style as 'solid' | 'dashed' | 'dotted',
        })
      note(TL + 6, 42, TW - 12)
      note(TL + 6, 60, TW - 12)
      marks.push(
        { prop: 'rule_length', kind: 'h', x: TL, y: 28, len: 32 },
        { prop: 'rule_width', kind: 'line', x1: TL, y1: 33.5, x2: TL + 32, y2: 33.5 },
        { prop: 'note_gap', kind: 'v', x: 113, y: 51, len: 9, band: band(TL, 51, TW, 9) },
        // The indent before the number, on the row of the first note, ending at its number.
        { prop: 'note_indent', kind: 'h', x: TL, y: 43, len: 6, band: band(TL, 40, 6, 29) },
      )
    }
    return { h, shapes, marks }
  },
  places: {
    tl: at('placement', 'Ort', 'place'),
    t: at('rule_length', 'Länge der Linie', 'rule length'),
    b: at('separator_style', 'Linie', 'rule'),
    bl: at('rule_width', 'Stärke', 'weight'),
    l: at('note_indent', 'Einzug', 'indent'),
    r: at('note_gap', 'zwischen', 'between'),
    tr: at('margin_width', 'Randbreite', 'margin width'),
    br: at('margin_gap', 'zum Text', 'to the text'),
  },
}

/** The drawings of each element, in the order they come. */
export const SCHEMATICS: Readonly<Record<string, readonly Schematic[]>> = {
  page: [PAPER_SIZE, PAGE],
  quote: [QUOTE_SPACE, QUOTE_LINES],
  list: [LIST],
  figure: [FIGURE_SPACE, FRAME],
  figure_caption: [caption(false)],
  table: [TABLE],
  table_caption: [caption(true)],
  footnote: [FOOTNOTES],
}

/**
 * The values of a header and of a footer that their own editor sets (`RunningLine.svelte`: a page
 * with the three places where the text stands on it, and the distance to the text), so the panel's
 * rows leave them out.
 */
export const RUNNING: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  ['header', 'footer'].map((id) => [
    id,
    ['slot_left', 'slot_center', 'slot_right', 'distance', 'mirror', 'skip_chapter_start'],
  ]),
)

/** The values of the body text that its own editor sets (`ParagraphSetup.svelte`), so the panel's rows leave them out. */
export const PARAGRAPHS: Readonly<Record<string, readonly string[]>> = {
  body: ['justify', 'hyphenate', 'paragraph_spacing', 'first_line_indent'],
}

/**
 * The values of a heading that its own editor sets (`HeadingPage.svelte`): where it stands, the
 * space around it, the break before it, the text around its number, and the two lines (which the
 * panel's line sections leave out), so the panel's rows leave them out too.
 */
export const HEADINGS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  ['heading', 'heading_1', 'heading_2', 'heading_3', 'heading_4'].map((id) => [
    id,
    ['align', 'above', 'below', 'break_before', 'number_prefix', 'number_suffix'],
  ]),
)

export const placedProps = (s: Schematic): string[] => Object.values(s.places).map((p) => p!.prop)

/** A group of the panel: its rows, and the drawings at its top. */
export interface PanelGroup {
  id: string
  de: string
  en: string
  ids: string[]
  schematics: Schematic[]
}

/**
 * The parts of an element that stand one under another on the page (the title page: the title, the
 * subtitle, the author, the date) are shown in that order, the space between two of them as a gap
 * between their settings: the property, by part, that is that space.
 */
export const GAPS: Readonly<Record<string, string>> = {
  title_page: 'space_above',
  title_page_subtitle: 'above',
  title_page_author: 'above',
  title_page_date: 'above',
}

/** The value set beside an element's name, by element: where a part of the title page stands. */
export const HEADS: Readonly<Record<string, string>> = {
  title_page_title: 'align',
  title_page_subtitle: 'align',
  title_page_author: 'align',
  title_page_date: 'align',
}

const LINE_IDS = new Set(LINE_SECTIONS.flatMap((section) => [section.toggle, ...section.fields]))

/**
 * The properties of an element in groups: the sections in their order, a last group for what no
 * section names, and the lines of a heading on their own. A drawing goes to the group of its first
 * value, and the values it places leave the rows, so every property is drawn exactly once.
 */
export function panelLayout(el: ElementDef): {
  groups: PanelGroup[]
  lines: (typeof LINE_SECTIONS)[number][]
  titled: boolean
  /** The space above the element, drawn as a gap before it (the parts of the title page). */
  gap?: string
  /** The value set beside the element's name (where a part of the title page stands). */
  head?: string
} {
  const drawings = SCHEMATICS[el.id] ?? []
  const gap = GAPS[el.id]
  const head = HEADS[el.id]
  const placed = new Set([
    ...drawings.flatMap(placedProps),
    ...(gap ? [gap] : []),
    ...(head ? [head] : []),
  ])
  const plain = el.props.filter((id) => !LINE_IDS.has(id))
  const used: string[] = []
  const groups: PanelGroup[] = []
  const sections = [
    ...PROP_SECTIONS.filter((section) => !section.only || section.only.includes(el.id)),
    { id: 'other', de: 'Weiteres', en: 'Other', props: plain },
  ]
  for (const section of sections) {
    // A property is in the first section that has it, so one used by two kinds of element (the
    // weight of a rule) is drawn once.
    const mine = plain.filter((id) => section.props.includes(id) && !used.includes(id))
    used.push(...mine)
    const schematics = drawings.filter((s) => mine.includes(placedProps(s)[0]!))
    const ids = mine.filter((id) => !placed.has(id))
    if (ids.length > 0 || schematics.length > 0)
      groups.push({ id: section.id, de: section.de, en: section.en, ids, schematics })
  }
  // What a header or footer holds is the main thing in its panel: it comes first.
  if (RUNNING[el.id]) groups.sort((a, b) => Number(b.id === 'running') - Number(a.id === 'running'))
  const lines = LINE_SECTIONS.filter((section) => el.props.includes(section.toggle))
  // Titles over the groups only help when there is more than one group.
  return {
    groups,
    lines,
    titled: groups.length + lines.length > 1,
    ...(gap ? { gap } : {}),
    ...(head ? { head } : {}),
  }
}
