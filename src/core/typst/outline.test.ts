import { describe, expect, it } from 'vitest'
import { outlineOf, skippedLevels } from './outline'
import { numberTargets } from './targets'
import type { Target } from './targets'

const heading = (level: number, title: string, at = 0): Target => ({
  kind: 'sec',
  label: null,
  at,
  labelAt: at,
  level,
  title,
})

describe('the outline', () => {
  it('lists the headings of all sheets in their order, numbered as the export numbers them', () => {
    const outline = outlineOf(
      numberTargets([
        {
          path: 'a.typ',
          inExport: true,
          targets: [heading(1, 'Einleitung'), heading(2, 'Frage', 40)],
        },
        {
          path: 'b.typ',
          inExport: true,
          targets: [
            heading(1, 'Methoden'),
            { kind: 'fig', label: 'fig-a', at: 9, labelAt: 9, level: 0, title: 'Ein Bild' },
          ],
        },
      ]),
    )
    expect(outline.map((e) => [e.number, e.title, e.path, e.level])).toEqual([
      ['1', 'Einleitung', 'a.typ', 1],
      ['1.1', 'Frage', 'a.typ', 2],
      ['2', 'Methoden', 'b.typ', 1],
    ])
    expect(outline[1]!.at).toBe(40)
    expect(skippedLevels(outline)).toBe(0)
  })

  it('flags a heading that skips a level, and the first heading when it is not a chapter', () => {
    const outline = outlineOf(
      numberTargets([
        {
          path: 'a.typ',
          inExport: true,
          targets: [heading(2, 'Vorwort'), heading(1, 'Kapitel'), heading(3, 'Zu tief')],
        },
      ]),
    )
    expect(outline.map((e) => e.skippedFrom)).toEqual([0, null, 1])
    expect(skippedLevels(outline)).toBe(2)
  })

  it('lists the headings of a sheet not in the export without a number, and does not count them', () => {
    const outline = outlineOf(
      numberTargets([
        { path: 'a.typ', inExport: true, targets: [heading(1, 'Kapitel')] },
        { path: 'notizen.typ', inExport: false, targets: [heading(3, 'Notiz')] },
        { path: 'b.typ', inExport: true, targets: [heading(2, 'Abschnitt')] },
      ]),
    )
    expect(outline.map((e) => [e.title, e.number, e.inExport, e.skippedFrom])).toEqual([
      ['Kapitel', '1', true, null],
      ['Notiz', '', false, null],
      ['Abschnitt', '1.1', true, null],
    ])
  })

  it('is empty for a project without headings', () => {
    expect(outlineOf(numberTargets([{ path: 'a.typ', inExport: true, targets: [] }]))).toEqual([])
  })
})
