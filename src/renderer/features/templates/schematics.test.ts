import { describe, expect, it } from 'vitest'
import { ELEMENTS, LINE_SECTIONS, PROPS } from '@core/export/elements'
import { parseStyle } from '@core/export/style'
import { GLYPHS } from './glyphs'
import {
  SCHEMATICS,
  measureCm,
  pageBox,
  panelLayout,
  placedProps,
  shareOf,
  thicknessPx,
} from './schematics'
import type { Schematic, Values } from './schematics'

/** The values the built-in style gives each element. */
const { style } = parseStyle('')

/** The drawings of a schematic for the element's values and for every choice placed around it. */
function variants(schematic: Schematic, values: Values) {
  const choices = placedProps(schematic).filter((p) => PROPS[p]!.type === 'enum')
  const bools = placedProps(schematic).filter((p) => PROPS[p]!.type === 'bool')
  return [
    values,
    ...choices.flatMap((p) => (PROPS[p]!.values ?? []).map((v) => ({ ...values, [p]: v }))),
    ...bools.map((p) => ({ ...values, [p]: values[p] !== true })),
    {
      ...values,
      frame_width: '1pt',
      frame_radius: '4pt',
      frame_distance: '3pt',
      fill: '#eeeeee',
      binding: '2cm',
    },
  ].map((v) => schematic.draw(v))
}

describe('the drawings of the template editor', () => {
  it('place only properties their element has, of a kind a field around a drawing can hold', () => {
    for (const [id, drawings] of Object.entries(SCHEMATICS)) {
      const element = ELEMENTS.find((e) => e.id === id)
      expect(element, id).toBeDefined()
      for (const drawing of drawings)
        for (const prop of placedProps(drawing)) {
          expect(element!.props, `${id}.${prop}`).toContain(prop)
          const def = PROPS[prop]!
          expect(['length', 'text', 'bool', 'enum'], `${id}.${prop}`).toContain(def.type)
          // A choice around a drawing is one drawn as small pictures (or the alignment's icons, or what a
          // place of a header holds, a menu above or below that place).
          if (def.type === 'enum')
            expect(
              GLYPHS[prop] !== undefined ||
                ['align', 'cell_align', 'slot_left', 'slot_center', 'slot_right'].includes(prop),
              `${id}.${prop}`,
            ).toBe(true)
        }
    }
  })

  it('have a picture for every value of a pictured choice', () => {
    for (const [prop, values] of Object.entries(GLYPHS))
      expect([...values].sort(), prop).toEqual([...(PROPS[prop]!.values ?? [])].sort())
  })

  it('mark what a length or a text sets, for some choice of the values around it', () => {
    for (const [id, drawings] of Object.entries(SCHEMATICS))
      for (const schematic of drawings) {
        const drawn = variants(schematic, style[id] ?? {})
        for (const prop of placedProps(schematic)) {
          if (!['length', 'text'].includes(PROPS[prop]!.type)) continue
          expect(
            drawn.some((d) => d.marks.some((m) => m.prop === prop)),
            `${id}.${prop}`,
          ).toBe(true)
        }
      }
  })

  it('stay inside their tile, whatever the choices', () => {
    for (const [id, drawings] of Object.entries(SCHEMATICS))
      for (const schematic of drawings)
        for (const d of variants(schematic, style[id] ?? {}))
          for (const s of d.shapes) {
            const [x1, y1, x2, y2] =
              s.kind === 'line'
                ? [s.x1, s.y1, s.x2, s.y2]
                : s.kind === 'marker'
                  ? [s.x, s.y, s.x, s.y]
                  : [s.x, s.y, s.x + s.w, s.y + s.h]
            expect(Math.min(x1, x2), `${id} ${s.kind}`).toBeGreaterThanOrEqual(0)
            expect(Math.min(y1, y2), `${id} ${s.kind}`).toBeGreaterThanOrEqual(0)
            expect(Math.max(x1, x2), `${id} ${s.kind}`).toBeLessThanOrEqual(d.w ?? 128)
            expect(Math.max(y1, y2), `${id} ${s.kind}`).toBeLessThanOrEqual(d.h)
          }
  })

  it('measure distances on whole pixels, so their ends meet what they measure', () => {
    for (const [id, drawings] of Object.entries(SCHEMATICS))
      for (const schematic of drawings)
        for (const d of variants(schematic, style[id] ?? {}))
          for (const m of d.marks)
            if (m.kind === 'h' || m.kind === 'v')
              expect([m.x, m.y, m.len].every(Number.isInteger), `${id}.${m.prop}`).toBe(true)
  })

  it('draw one page or two, upright or across, as the page is set', () => {
    const base = style['page'] ?? {}
    const box = (v: Values) => pageBox({ ...base, ...v }, null, 176, 224)
    expect(box({ facing: 'facing' }).count).toBe(2)
    expect(box({ facing: 'single' }).count).toBe(1)
    const upright = box({ facing: 'single', orientation: 'portrait' })
    const across = box({ facing: 'single', orientation: 'landscape' })
    expect(upright.ph).toBeGreaterThan(upright.pw)
    expect(across.pw).toBeGreaterThan(across.ph)
    // Two pages together stay within the room, one beside the other.
    const spread = box({ facing: 'facing' })
    expect(spread.count * spread.pw).toBeLessThanOrEqual(176)
  })

  it('draw a margin in its proportion to the paper, never less than a few pixels', () => {
    const base = { ...(style['page'] ?? {}), paper: 'a4', orientation: 'portrait' }
    const wide = pageBox({ ...base, margin_inside: '5cm' }, null, 176, 224)
    const narrow = pageBox({ ...base, margin_inside: '2cm' }, null, 176, 224)
    const none = pageBox({ ...base, margin_inside: '0cm' }, null, 176, 224)
    expect(wide.inside).toBeGreaterThan(narrow.inside)
    expect(none.inside).toBeGreaterThanOrEqual(6)
    // A margin that cannot be read as a length is drawn as a usual one.
    expect(pageBox({ ...base, margin_inside: '10%' }, null, 176, 224).inside).toBeGreaterThan(0)
  })

  it('take the binding offset at the inner edge of each page', () => {
    const base = { ...(style['page'] ?? {}), facing: 'facing' }
    expect(pageBox(base, null, 176, 224).bind).toBe(0)
    expect(pageBox(base, '1cm', 176, 224).bind).toBeGreaterThan(0)
  })

  it('leave every property of every element in the panel exactly once', () => {
    for (const element of ELEMENTS) {
      const { groups, lines, gap, head } = panelLayout(element)
      const shown = [
        ...groups.flatMap((g) => [...g.ids, ...g.schematics.flatMap(placedProps)]),
        ...lines.flatMap((l) => [l.toggle, ...l.fields]),
        ...(gap ? [gap] : []),
        ...(head ? [head] : []),
      ]
      expect([...shown].sort(), element.id).toEqual([...element.props].sort())
    }
  })

  it('keep the lines of a heading as their own cards', () => {
    const heading = ELEMENTS.find((e) => e.id === 'heading_2')!
    expect(panelLayout(heading).lines.map((l) => l.toggle)).toEqual(
      LINE_SECTIONS.filter((l) => heading.props.includes(l.toggle)).map((l) => l.toggle),
    )
  })

  it('measure a line of a heading against the text: its share of the width and its thickness', () => {
    // A4 with margins of 3 and 2 cm: the text is 16 cm wide.
    const measure = measureCm({ paper: 'a4', margin_inside: '3cm', margin_outside: '2cm' })
    expect(measure).toBeCloseTo(16)
    expect(shareOf('100%', measure, 0.4)).toBe(1)
    expect(shareOf('50%', measure, 0.4)).toBeCloseTo(0.5)
    expect(shareOf('4cm', measure, 0.4)).toBeCloseTo(0.25)
    // An em is the heading's: 10 em of 0.4 cm is 4 cm. A length longer than the text stops at it.
    expect(shareOf('10em', measure, 0.4)).toBeCloseTo(0.25)
    expect(shareOf('30cm', measure, 0.4)).toBe(1)
    // A line is always something to see, and a thin one is thin, a heavy one heavier, but no more.
    expect(thicknessPx('0.5pt', 0.4)).toBeLessThan(thicknessPx('3pt', 0.4))
    expect(thicknessPx('0.1pt', 0.4)).toBe(1)
    expect(thicknessPx('20pt', 0.4)).toBe(4)
  })
})
