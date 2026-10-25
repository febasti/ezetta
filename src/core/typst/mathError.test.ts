import { describe, expect, it } from 'vitest'
import { classifyMathError, excerptAt, mathDiagnostic } from './mathError'

// The compiler's short report for a formula on the page of `mathDocument`; the formula starts on
// line 4 (after the three lines of settings) at column 2 for a block formula (`$ `).
const report = (line: number, column: number, message: string) =>
  `<stdin>:${line}:${column}: error: ${message}`

describe('mathDiagnostic', () => {
  it('turns a position on the page into an offset in the formula, for a block formula', () => {
    // "$ frac(1 $": the "(" is at column 6, which is offset 4 of "frac(1".
    expect(mathDiagnostic(report(4, 6, 'unclosed delimiter'), 'frac(1', true)).toEqual({
      message: 'unclosed delimiter',
      at: 4,
    })
  })

  it('does the same for a formula in the text, after its box', () => {
    const source = 'foo(x)'
    const page = `#set page(width: auto, height: auto, margin: (x: 0pt, y: 1pt), fill: none)\n#set text(size: 10pt, fill: rgb("#010203"))\n#set math.equation(numbering: none)\n#box(width: 1pt, height: 1pt, fill: rgb("#fe00fe"))$${source}$\n`
    const column = page.split('\n')[3]!.indexOf(source)
    expect(mathDiagnostic(report(4, column, 'unknown variable: foo'), source, false).at).toBe(0)
  })

  it('prefers a report that lies in the formula, and falls back to the first', () => {
    const stderr = [report(4, 0, 'unclosed delimiter'), report(4, 3, 'unclosed string')].join('\n')
    expect(mathDiagnostic(stderr, '"abc', true)).toEqual({ message: 'unclosed string', at: 1 })
    expect(mathDiagnostic(report(1, 0, 'something'), 'x', true)).toEqual({
      message: 'something',
      at: null,
    })
  })

  it('reads a report with no position', () => {
    expect(mathDiagnostic('error: timed out', 'x', true)).toEqual({
      message: 'timed out',
      at: null,
    })
  })
})

describe('classifyMathError', () => {
  const diagnostic = (message: string, at: number | null = 0) => ({ message, at })
  it('knows what the closing bracket of the open one is', () => {
    expect(classifyMathError(diagnostic('unclosed delimiter', 4), 'frac(1')).toEqual({
      kind: 'unclosed',
      open: '(',
      close: ')',
    })
    expect(classifyMathError(diagnostic('unclosed delimiter', 0), '[a')).toMatchObject({
      close: ']',
    })
  })

  it('tells a LaTeX backslash from an unknown name', () => {
    expect(classifyMathError(diagnostic('unknown variable: lpha', 2), '\\alpha')).toEqual({
      kind: 'unknown',
      name: 'alpha',
      backslash: true,
    })
    expect(classifyMathError(diagnostic('unknown variable: foo'), 'foo(x)')).toMatchObject({
      backslash: false,
    })
  })

  it('sorts the other messages', () => {
    expect(classifyMathError(diagnostic('expected expression'), 'x^').kind).toBe('expected')
    expect(classifyMathError(diagnostic('unclosed string'), '"a').kind).toBe('string')
    expect(classifyMathError(diagnostic('unexpected argument'), 'frac(1,2,3)').kind).toBe(
      'arguments',
    )
    expect(classifyMathError(diagnostic('unexpected closing delimiter'), 'a)').kind).toBe('closing')
    expect(classifyMathError(diagnostic('expected content, found array'), 'vec(1;2)').kind).toBe(
      'other',
    )
  })
})

describe('excerptAt', () => {
  it('marks the character at fault and says line and column', () => {
    expect(excerptAt('frac(1', 4)).toEqual({
      before: 'frac',
      mark: '(',
      after: '1',
      line: 1,
      column: 5,
    })
    expect(excerptAt('a +\nb ^', 7)?.line).toBe(2)
  })

  it('marks the end of the line when the error is after the last character', () => {
    expect(excerptAt('x^', 2)).toMatchObject({ before: 'x^', mark: '', after: '' })
  })

  it('cuts a long line around the place, and has none without a place', () => {
    const long = `${'a'.repeat(100)}(${'b'.repeat(100)}`
    const cut = excerptAt(long, 100)!
    expect(cut.before.startsWith('…')).toBe(true)
    expect(cut.after.endsWith('…')).toBe(true)
    expect(cut.before.length + 1 + cut.after.length).toBeLessThan(60)
    expect(excerptAt('x', null)).toBeNull()
  })
})
