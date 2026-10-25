import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { parseTypst } from '@core/typst/parser'
import { scanTargets } from '@core/typst/targets'
import { citeField, missingField } from './citeState'
import { figureField } from './figureState'
import { footnoteField } from './footnoteState'
import { markupExtension } from './markup'
import { mathField } from './mathState'
import { quoteField } from './quoteState'
import { refConfig, refField } from './refState'
import { tableField } from './tableState'
import { typstLanguage } from './typst'

/**
 * Guards the cost of typing in a long sheet: 60 sections, about 6,700 words, 240 footnotes and 480
 * citations, in a project of 41 such sheets whose targets cross-references are numbered across. A
 * keystroke takes about 4 ms on an M-series Mac; a frame is 16 ms. What keeps it there: a balanced
 * syntax tree, footnote texts reused while they do not change, and heading titles read from the
 * heading alone.
 */
const PARAGRAPH =
  'Die _Untersuchung_ zeigt, dass *wichtige* Ergebnisse @mueller2020 vorliegen#footnote[Vgl. ' +
  'hierzu @smith2019, S. 12.]. Ein weiterer Satz mit $x^2$ und "Zitat" folgt hier, damit der ' +
  'Absatz lang genug ist. '

function longSheet(): string {
  let doc = ''
  for (let i = 0; i < 60; i++) doc += `== Abschnitt ${i} <sec-${i}>\n\n${PARAGRAPH.repeat(4)}\n\n`
  return doc
}

const LIVE = 'kapitel-20.typ'

/** The other sheets of the project, with what can be referenced in each. */
function projectSheets() {
  const doc = longSheet()
  const targets = scanTargets(parseTypst(doc), doc)
  return Array.from({ length: 41 }, (_, i) => ({
    path: `kapitel-${i}.typ`,
    inExport: true,
    targets,
  }))
}

const FIELDS: Extension = [
  refConfig.of({ sheets: projectSheets(), livePath: LIVE }),
  typstLanguage,
  footnoteField,
  figureField,
  mathField,
  quoteField,
  tableField,
  citeField,
  missingField,
  refField,
  markupExtension({ showSource: false, labels: { comment: (text) => text } }),
]

/** Median milliseconds of typing one character, `runs` times, a little further each time. */
function keystrokeMs(state: EditorState, at: number, runs: number): number {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const pos = at + i
    const start = performance.now()
    state = state.update({
      changes: { from: pos, insert: 'x' },
      selection: { anchor: pos + 1 },
    }).state
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]!
}

describe('editor performance on a long sheet', () => {
  it('keeps the syntax tree balanced', () => {
    const doc = longSheet()
    const tree = parseTypst(doc)
    // A flat tree has one child per paragraph and heading (more than a thousand here), and every
    // lookup by position walks them all.
    expect(tree.children.length).toBeLessThan(64)
    const at = doc.indexOf('@smith2019', doc.length / 2)
    expect(tree.resolveInner(at + 1).name).toBe('Ref')
    expect(tree.topNode.getChildren('Heading')).toHaveLength(60)
  })

  it('types a character within budget', () => {
    const state = EditorState.create({ doc: longSheet(), extensions: FIELDS })
    keystrokeMs(state, 1500, 10) // warm up
    const ms = keystrokeMs(state, 2000, 41)
    expect(ms, `median keystroke took ${ms.toFixed(2)} ms`).toBeLessThan(10)
  })
})

describe('footnote texts', () => {
  const notesOf = (state: EditorState): string[] => state.field(footnoteField).map((n) => n.text)

  it('are kept when the text around them changes', () => {
    let state = EditorState.create({
      doc: 'Eins#footnote[Siehe _dort_.] zwei#footnote[Noch eine.]',
      extensions: [typstLanguage, footnoteField],
    })
    state = state.update({ changes: { from: 0, insert: 'Neu: ' } }).state
    expect(notesOf(state)).toEqual(['Siehe dort.', 'Noch eine.'])
    expect(syntaxTree(state).length).toBe(state.doc.length)
  })

  it('follow an edit inside a note', () => {
    let state = EditorState.create({
      doc: 'Eins#footnote[Siehe dort.] zwei#footnote[Siehe dort.]',
      extensions: [typstLanguage, footnoteField],
    })
    const inFirst = state.doc.toString().indexOf('dort')
    state = state.update({ changes: { from: inFirst, insert: '*hier* ' } }).state
    expect(notesOf(state)).toEqual(['Siehe hier dort.', 'Siehe dort.'])
  })
})
