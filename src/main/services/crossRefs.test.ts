import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTypst } from '@core/typst/parser'
import { numberTargets, scanTargets } from '@core/typst/targets'
import { findTypst } from './mathRenderer'

const binary = findTypst({ override: process.env['EZETTA_TYPST'] })
const installed = binary !== 'typst'

const SHEET_ONE = [
  '= Eins <sec-a>',
  '== Zwei <sec-b>',
  '=== Drei <sec-c>',
  '=== Vier <sec-d>',
  '== Fünf <sec-e>',
  '$ a $ <eq-a>',
  '#figure(table(columns: 1, [a]), caption: [T1]) <tbl-a>',
  '',
].join('\n')
const SHEET_TWO = [
  '= Sechs <sec-f>',
  '==== Tief <sec-g>',
  '$ b $',
  '$ c $ <eq-b>',
  '#figure(table(columns: 1, [b]), caption: [T2]) <tbl-b>',
  '',
].join('\n')

/** What Typst counts at a label, in the same place where the editor shows a number. */
function typstNumbers(labels: readonly string[]): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'ezetta-refs-'))
  try {
    const probes = labels
      .map((label) => {
        const counter = label.startsWith('sec-')
          ? 'counter(heading)'
          : label.startsWith('eq-')
            ? 'counter(math.equation)'
            : 'counter(figure.where(kind: table))'
        return `${label.replace(/\W/g, '_')}: ${counter}.at(<${label}>)`
      })
      .join(',\n ')
    const source = [
      '#set heading(numbering: "1.1")',
      '#set math.equation(numbering: "(1)")',
      SHEET_ONE,
      SHEET_TWO,
      `#context [#metadata((\n ${probes}\n)) <out>]`,
    ].join('\n')
    const file = join(dir, 'main.typ')
    writeFileSync(file, source)
    const json = execFileSync(binary, ['eval', 'query(<out>).first().value', '--in', file], {
      encoding: 'utf8',
    })
    const parsed = JSON.parse(json) as Record<string, number[]>
    return Object.fromEntries(
      labels.map((label) => [label, parsed[label.replace(/\W/g, '_')]!.join('.')]),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe.skipIf(!installed)('cross-reference numbers against the real Typst compiler', () => {
  it('number headings, tables, and equations as Typst counts them', () => {
    const sheets = [SHEET_ONE, SHEET_TWO].map((text, i) => ({
      path: `${i}.typ`,
      inExport: true,
      targets: scanTargets(parseTypst(text), text),
    }))
    const numbered = numberTargets(sheets).filter((t) => t.label)
    const labels = numbered.map((t) => t.label!)
    const theirs = typstNumbers(labels)
    for (const target of numbered) {
      expect([target.label, target.number]).toEqual([target.label, theirs[target.label!]])
    }
    expect(labels.length).toBeGreaterThan(8)
  })
})
