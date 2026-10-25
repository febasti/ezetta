import { describe, expect, it } from 'vitest'
import { analyzeSheet } from './text'
import { scanFigures } from './figures'
import { scanFormulas } from './math'
import { parseTypst } from './parser'
import { scanTables } from './tables'
import {
  crossRefAt,
  crossRefSource,
  findTarget,
  fromTuple,
  labelEdit,
  labelsIn,
  newLabel,
  numberTargets,
  referenceText,
  replaceSheetTargets,
  scanCrossRefs,
  scanTargets,
  supplementsFor,
  toTuple,
} from './targets'

const targets = (doc: string) => scanTargets(parseTypst(doc), doc)
const refs = (doc: string) => scanCrossRefs(parseTypst(doc), doc)
const apply = (doc: string, edit: { from: number; to: number; insert: string }): string =>
  doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)

const FIGURE = '#figure(\n  image("assets/a.png", width: 80%),\n  caption: [Ein Bild],\n)'

describe('scanTargets', () => {
  it('finds headings, figures, tables, and block formulas in text order', () => {
    const doc = [
      '= Einleitung <sec-einleitung>',
      '',
      `${FIGURE} <fig-a>`,
      '',
      '$ E = m c^2 $ <eq-energie>',
      '',
      '#figure(table(columns: 1, [a]), caption: [Werte]) <tbl-werte>',
      '',
      'Ein $x$ im Text.',
    ].join('\n')
    expect(targets(doc).map((t) => [t.kind, t.label, t.title])).toEqual([
      ['sec', 'sec-einleitung', 'Einleitung'],
      ['fig', 'fig-a', 'Ein Bild'],
      ['eq', 'eq-energie', 'E = m c^2'],
      ['tbl', 'tbl-werte', 'Werte'],
    ])
  })

  it('counts things without a label and says where a label would go', () => {
    const doc = `== Methoden\n\n${FIGURE}\n\n$ x $\n`
    const found = targets(doc)
    expect(found.map((t) => [t.kind, t.label])).toEqual([
      ['sec', null],
      ['fig', null],
      ['eq', null],
    ])
    expect(apply(doc, labelEdit(found[0]!, 'sec-methoden'))).toContain(
      '== Methoden <sec-methoden>\n',
    )
    expect(apply(doc, labelEdit(found[1]!, 'fig-a'))).toContain('\n) <fig-a>\n')
    expect(apply(doc, labelEdit(found[2]!, 'eq-a'))).toContain('$ x $ <eq-a>')
  })

  it('reads the level and ignores a trailing comment when placing the label', () => {
    const doc = '=== Tief   // noch offen\n'
    const [heading] = targets(doc)
    expect(heading).toMatchObject({ kind: 'sec', level: 3, title: 'Tief', label: null })
    expect(apply(doc, labelEdit(heading!, 'sec-tief'))).toBe(
      '=== Tief <sec-tief>   // noch offen\n',
    )
  })

  it('reads a heading label before a trailing comment', () => {
    expect(targets('= A <sec-a> // c\n')[0]).toMatchObject({ label: 'sec-a', title: 'A' })
  })

  it('leaves out inline formulas, bare tables, and bare images', () => {
    const doc = '$x$ und #table(columns: 1, [a]) und #image("assets/a.png")\n'
    expect(targets(doc)).toEqual([])
  })

  it('takes the title of a heading without markup and notes', () => {
    const [heading] = targets('= Ein *starker*#footnote[Notiz] Titel\n')
    expect(heading!.title).toBe('Ein starker Titel')
  })

  it('shortens long titles', () => {
    const [heading] = targets(`= ${'wort '.repeat(40)}\n`)
    expect(heading!.title.length).toBeLessThanOrEqual(80)
    expect(heading!.title.endsWith('…')).toBe(true)
  })

  it('gives the same targets from figures, tables, and formulas found before', () => {
    const doc = `= Kapitel\n\n${FIGURE} <fig-a>\n\n$ x = y $\n\n#figure(table(columns: 1, [a]), caption: [T])\n`
    const tree = parseTypst(doc)
    const found = {
      figures: scanFigures(tree, doc),
      tables: scanTables(tree, doc),
      formulas: scanFormulas(tree, doc),
    }
    expect(scanTargets(tree, doc, found)).toEqual(scanTargets(tree, doc))
    expect(scanTargets(tree, doc, found).map((t) => t.kind)).toEqual(['sec', 'fig', 'eq', 'tbl'])
  })
})

describe('scanCrossRefs', () => {
  it('reads references with a reserved prefix and leaves citations alone', () => {
    const doc = 'Siehe @fig-a, @tbl-b[Zusatz] und @smith2020 sowie @eq-c.'
    expect(refs(doc).map((r) => [r.label, r.supplement])).toEqual([
      ['fig-a', null],
      ['tbl-b', 'Zusatz'],
      ['eq-c', null],
    ])
    expect(doc.slice(refs(doc)[1]!.from, refs(doc)[1]!.to)).toBe('@tbl-b[Zusatz]')
  })

  it('reads the long form and nothing else with #ref', () => {
    const doc = '#ref(<sec-a>)x und #ref(<sec-b>, supplement: [S]) und #ref(<smith>)'
    expect(refs(doc)).toMatchObject([{ label: 'sec-a', long: true }])
  })

  it('leaves out code, raw text, and comments', () => {
    expect(refs('`@fig-a` // @fig-b\n#let x = "@fig-c"\n/* @fig-d */ @fig-e')).toMatchObject([
      { label: 'fig-e' },
    ])
  })

  it('finds the reference around a position', () => {
    const doc = 'a @fig-a b'
    expect(crossRefAt(refs(doc), 4)?.label).toBe('fig-a')
    expect(crossRefAt(refs(doc), 9)).toBeUndefined()
  })
})

describe('numberTargets', () => {
  const sheet = (path: string, doc: string, inExport = true) => ({
    path,
    inExport,
    targets: targets(doc),
  })

  it('numbers across sheets in the order given', () => {
    const one = sheet('a.typ', `= Eins\n\n${FIGURE} <fig-a>\n\n$ x $ <eq-a>\n`)
    const two = sheet('b.typ', `= Zwei\n\n${FIGURE} <fig-b>\n\n$ y $ <eq-b>\n`)
    const numbered = numberTargets([one, two])
    expect(numbered.map((t) => [t.label ?? t.kind, t.number])).toEqual([
      ['sec', '1'],
      ['fig-a', '1'],
      ['eq-a', '1'],
      ['sec', '2'],
      ['fig-b', '2'],
      ['eq-b', '2'],
    ])
    expect(findTarget(numbered, 'fig-b')).toMatchObject({ path: 'b.typ', index: 1 })
  })

  it('numbers headings by level, padding a skipped level with zero as Typst does', () => {
    const doc = '= A\n== B\n=== C\n=== D\n== E\n= F\n==== G\n'
    expect(numberTargets([sheet('a.typ', doc)]).map((t) => t.number)).toEqual([
      '1',
      '1.1',
      '1.1.1',
      '1.1.2',
      '1.2',
      '2',
      '2.0.0.1',
    ])
  })

  it('does not number sheets outside the export, nor let them count', () => {
    const out = sheet('x.typ', '= Entwurf\n', false)
    const numbered = numberTargets([out, sheet('y.typ', '= Echt\n')])
    expect(numbered.map((t) => [t.number, t.inExport])).toEqual([
      ['', false],
      ['1', true],
    ])
  })
})

describe('referenceText', () => {
  it('prints the words of the language before the number', () => {
    const german = supplementsFor('de')
    expect(referenceText({ kind: 'fig', number: '3' }, german)).toBe('Abbildung 3')
    expect(referenceText({ kind: 'sec', number: '1.2' }, german)).toBe('Abschnitt 1.2')
    expect(referenceText({ kind: 'eq', number: '2' }, german)).toBe('Gleichung (2)')
    expect(referenceText({ kind: 'tbl', number: '1' }, supplementsFor('en-GB'))).toBe('Table 1')
  })
})

describe('labels', () => {
  it('makes a label from the title, free among the taken ones', () => {
    expect(newLabel('sec', 'Größe & Ärger', new Set())).toBe('sec-groesse-aerger')
    expect(newLabel('sec', 'Methoden', new Set(['sec-methoden']))).toBe('sec-methoden-2')
    expect(newLabel('sec', 'Methoden', new Set(['sec-methoden', 'sec-methoden-2']))).toBe(
      'sec-methoden-3',
    )
  })

  it('falls back to a word for the kind, and keeps long titles short', () => {
    expect(newLabel('eq', '', new Set())).toBe('eq-gleichung')
    expect(newLabel('fig', '„“', new Set())).toBe('fig-bild')
    const label = newLabel(
      'sec',
      'ein sehr langer Titel für ein Kapitel über alles Mögliche',
      new Set(),
    )
    expect(label.length).toBeLessThanOrEqual(36)
    expect(label.startsWith('sec-ein-sehr-langer-titel')).toBe(true)
  })

  it('collects the labels written in a text', () => {
    expect([...labelsIn('= A <sec-a>\n$ x $ <eq-b>\n')]).toEqual(['sec-a', 'eq-b'])
  })

  it('writes a reference, in the long form where text after it would join the label', () => {
    expect(crossRefSource('fig-a', ' und')).toBe('@fig-a')
    expect(crossRefSource('fig-a', 'x')).toBe('#ref(<fig-a>)')
    expect(crossRefSource('fig-a', '.x')).toBe('#ref(<fig-a>)')
    expect(crossRefSource('fig-a', '[')).toBe('#ref(<fig-a>)')
    expect(crossRefSource('fig-a', '. Danach')).toBe('@fig-a')
  })
})

describe('sheet statistics', () => {
  it('carry the targets as tuples that read back', () => {
    const doc = '= Einleitung <sec-einleitung>\n\n$ x $\n'
    const stats = analyzeSheet(doc)
    expect(stats.targets).toEqual([
      ['sec', 'sec-einleitung', 1, 'Einleitung', 0, 12],
      ['eq', '', 0, 'x', expect.any(Number), expect.any(Number)],
    ])
    expect(stats.targets.map(fromTuple)).toEqual(targets(doc))
    expect(targets(doc).map(toTuple)).toEqual(stats.targets)
  })
})

describe('replaceSheetTargets', () => {
  const A = `= Eins\n\n${FIGURE} <fig-a>\n\n== Unter\n`
  const B = `= Zwei\n\n$ y $ <eq-b>\n\n${FIGURE}\n`
  const C = `= Drei\n\n${FIGURE} <fig-c>\n`
  const project = (b: string) => [
    { path: 'a.typ', inExport: true, targets: targets(A) },
    { path: 'b.typ', inExport: true, targets: targets(b) },
    { path: 'c.typ', inExport: true, targets: targets(C) },
  ]

  it('gives what numbering again gives, when targets only moved or were retitled', () => {
    const edited = `Ein Satz davor.\n\n= Zwei neu\n\n$ y + 1 $ <eq-b>\n\n${FIGURE}\n`
    const kept = replaceSheetTargets(
      numberTargets(project(B)),
      'b.typ',
      targets(B),
      targets(edited),
    )
    expect(kept).toEqual(numberTargets(project(edited)))
  })

  it('leaves the other sheets as they were', () => {
    const before = numberTargets(project(B))
    const kept = replaceSheetTargets(before, 'b.typ', targets(B), targets(`Neu.\n\n${B}`))!
    expect(kept[0]).toBe(before[0])
    expect(kept.at(-1)).toBe(before.at(-1))
  })

  it('asks for numbering again when a target is added, removed, or changes level', () => {
    const numbered = numberTargets(project(B))
    const before = targets(B)
    expect(replaceSheetTargets(numbered, 'b.typ', before, targets(`${B}\n== Neu\n`))).toBeNull()
    expect(replaceSheetTargets(numbered, 'b.typ', before, targets('= Zwei\n'))).toBeNull()
    const deeper = B.replace('= Zwei', '== Zwei')
    expect(replaceSheetTargets(numbered, 'b.typ', before, targets(deeper))).toBeNull()
  })

  it('changes nothing for a sheet that is not numbered with the project', () => {
    const numbered = numberTargets(project(B))
    expect(replaceSheetTargets(numbered, 'x.typ', targets(B), targets(`Neu.\n\n${B}`))).toBe(
      numbered,
    )
  })
})
