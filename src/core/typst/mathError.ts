import { mathDocument } from './math'

/**
 * What goes wrong in a formula, from the compiler's short report, so the editor can say where and
 * what to do. The compiler checks the formula inside a page (`mathDocument`); a position in that
 * page is turned back into an offset in the formula's own source.
 */

export interface MathDiagnostic {
  /** The compiler's own words, without the position. */
  message: string
  /** Where in the formula's source, as an offset in 0 to its length; null when the report names no place in it. */
  at: number | null
}

/** Where the formula's source starts inside the page the compiler is given. */
function sourceStart(display: boolean): number {
  const probe = '\u0001'
  return mathDocument(probe, display).indexOf(probe)
}

const REPORT = /^<stdin>:(\d+):(\d+): error: (.*)$/

/**
 * The error to show for a failed run. The compiler may report several, and the first is not always
 * the helpful one (an open string also reports its page's bracket first): the first that lies in
 * the formula is taken, else the first.
 */
export function mathDiagnostic(stderr: string, source: string, display: boolean): MathDiagnostic {
  const page = mathDocument(source, display)
  const starts = [0]
  for (let i = 0; i < page.length; i += 1) if (page[i] === '\n') starts.push(i + 1)
  const base = sourceStart(display)
  const found: MathDiagnostic[] = []
  for (const line of stderr.split('\n')) {
    const match = REPORT.exec(line)
    if (!match) continue
    const lineStart = starts[Number(match[1]) - 1]
    const at = lineStart === undefined ? null : lineStart + Number(match[2]) - base
    found.push({
      message: match[3]!.trim(),
      at: at === null || at < 0 || at > source.length ? null : at,
    })
  }
  const message = stderr.split('\n').find((l) => /\berror:/.test(l))
  return (
    found.find((d) => d.at !== null) ??
    found[0] ?? {
      message: message
        ? message.replace(/^.*?\berror:\s*/, '').trim()
        : 'Could not draw the formula',
      at: null,
    }
  )
}

/** The kinds of problem the editor has words for. */
export type MathProblem =
  | { kind: 'unclosed'; open: string; close: string }
  | { kind: 'closing' }
  | { kind: 'expected' }
  | { kind: 'unknown'; name: string; backslash: boolean }
  | { kind: 'string' }
  | { kind: 'arguments' }
  | { kind: 'other' }

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '|': '|' }

/** Sorts a compiler's message into a problem the editor can explain. */
export function classifyMathError(diagnostic: MathDiagnostic, source: string): MathProblem {
  const { message, at } = diagnostic
  if (/^unclosed delimiter/.test(message)) {
    const open = at === null ? '(' : (source[at] ?? '(')
    return { kind: 'unclosed', open, close: PAIRS[open] ?? ')' }
  }
  if (/^unexpected closing delimiter/.test(message)) return { kind: 'closing' }
  if (/^unclosed string/.test(message)) return { kind: 'string' }
  if (/^expected expression/.test(message)) return { kind: 'expected' }
  if (/^unexpected argument/.test(message)) return { kind: 'arguments' }
  const unknown = /^unknown variable: (.+)$/.exec(message)
  if (unknown) {
    // `\alpha` is read as the escaped letter a and then the name `lpha`: the name written is the whole word.
    const backslash =
      at !== null && at > 1 && source[at - 2] === '\\' && /[A-Za-z]/.test(source[at - 1]!)
    const word = backslash ? /^[A-Za-z]+/.exec(source.slice(at! - 1))?.[0] : undefined
    return { kind: 'unknown', name: word ?? unknown[1]!, backslash }
  }
  return { kind: 'other' }
}

/** The line of the source that holds the error, with the character at fault marked. */
export function excerptAt(
  source: string,
  at: number | null,
  width = 48,
): { before: string; mark: string; after: string; line: number; column: number } | null {
  if (at === null) return null
  const lineStart = source.lastIndexOf('\n', at - 1) + 1
  const lineEndAt = source.indexOf('\n', at)
  const lineEnd = lineEndAt === -1 ? source.length : lineEndAt
  const line = source.slice(0, at).split('\n').length
  const column = at - lineStart + 1
  const from = Math.max(lineStart, at - Math.floor(width / 2))
  const to = Math.min(lineEnd, from + width)
  return {
    before: (from > lineStart ? '…' : '') + source.slice(from, at),
    mark: at < lineEnd ? source[at]! : '',
    after: source.slice(at + 1, to) + (to < lineEnd ? '…' : ''),
    line,
    column,
  }
}
