import { describe, expect, it } from 'vitest'
import { ELEMENTS, LINE_SECTIONS, PROPS } from '@core/export/elements'
import { parseStyle } from '@core/export/style'
import { GLYPHS } from './glyphs'
import { SCHEMATICS, panelLayout, placedProps } from './schematics'
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
            expect(Math.max(x1, x2), `${id} ${s.kind}`).toBeLessThanOrEqual(128)
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
    const page = SCHEMATICS['page']!.find((s) => placedProps(s).includes('facing'))!
    const sheets = (v: Values) => page.draw(v).shapes.filter((s) => s.kind === 'sheet')
    const base = style['page'] ?? {}
    expect(sheets({ ...base, facing: 'facing' })).toHaveLength(2)
    expect(sheets({ ...base, facing: 'single' })).toHaveLength(1)
    const [upright] = sheets({ ...base, facing: 'single', orientation: 'portrait' })
    const [across] = sheets({ ...base, facing: 'single', orientation: 'landscape' })
    expect(upright!.kind === 'sheet' && upright!.h > upright!.w).toBe(true)
    expect(across!.kind === 'sheet' && across!.w > across!.h).toBe(true)
  })

  it('hatch the binding offset at the inner edge of each page, and move the text out by it', () => {
    const page = SCHEMATICS['page']!.find((s) => placedProps(s).includes('facing'))!
    const base = { ...(style['page'] ?? {}), facing: 'facing' }
    const plain = page.draw(base)
    const bound = page.draw({ ...base, binding: '1cm' })
    expect(plain.shapes.some((s) => s.kind === 'hatch')).toBe(false)
    const rects = (d: typeof plain, kind: 'sheet' | 'hatch') =>
      d.shapes.flatMap((s) => (s.kind === kind ? [{ x: s.x, w: s.w }] : []))
    const [left, right] = rects(bound, 'sheet')
    const [h1, h2] = rects(bound, 'hatch')
    // Inside the paper's hairline: up to it on the left page, from it on the right one.
    expect(h1!.x + h1!.w).toBe(left!.x + left!.w - 1)
    expect(h2!.x).toBe(right!.x + 1)
    const inside = (d: typeof plain) =>
      d.marks.flatMap((m) => (m.prop === 'margin_inside' && m.kind === 'h' ? [m.x] : []))[0]!
    expect(inside(bound)).toBeGreaterThan(inside(plain))
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
})
