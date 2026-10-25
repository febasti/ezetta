import type { SheetStats } from '../project/tree'
import { scanFootnotes, summarizeFootnotes } from './footnotes'
import { citationOverview } from './citations'
import { scanFigures } from './figures'
import { scanTables } from './tables'
import { scanTargets, toTuple } from './targets'
import { parseTypst } from './parser'
import { sheetPreview } from './preview'

/**
 * Word counting and previews for the Typst subset the app supports: count the words that would
 * print. Comments, markup, code, math, raw text, labels, and citation supplements do not count.
 * A citation or reference counts as one word.
 * Footnote text is counted separately. The text of function arguments, such as figure captions,
 * is not counted.
 *
 * The words are found by a tolerant scanner over the source, not by walking the syntax tree.
 * It never throws: anything it does not understand is skipped.
 */

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u
const IDENT_START = /[\p{L}_]/u
const IDENT_CHAR = /[\p{L}\p{N}_-]/u
const KEY_CHAR = /[\p{L}\p{N}_-]/u
const CODE_LINE_KEYWORDS = new Set([
  'set',
  'show',
  'let',
  'import',
  'include',
  'if',
  'for',
  'while',
  'context',
  'else',
])
const URL_START = /^https?:\/\/\S+/

interface Counter {
  body: number
  footnote: number
}

export function analyzeSheet(text: string): SheetStats {
  const counter: Counter = { body: 0, footnote: 0 }
  scanMarkup(text, 0, text.length, 'body', counter)
  const tree = parseTypst(text)
  const preview = sheetPreview(tree, text)
  const summary = summarizeFootnotes(scanFootnotes(tree, text))
  const figures = scanFigures(tree, text)
  const tables = scanTables(tree, text)
  const cited = citationOverview(text, tree)
  return {
    words: counter.body,
    footnoteWords: counter.footnote,
    title: preview.title,
    preview: preview.lines,
    footnotes: summary.count,
    footnotesAfterChapter: summary.afterLastChapter,
    figures: figures.filter((f) => f.kind === 'figure').length,
    tables: tables.filter((t) => t.kind === 'figure').length,
    citations: cited.works,
    missingCitations: cited.missing,
    citationChecks: cited.checks,
    targets: scanTargets(tree, text, { figures, tables }).map(toTuple),
  }
}

/** The words of the text that would print, without its footnotes (the word count alone, without parsing). */
export function countWords(text: string): number {
  const counter: Counter = { body: 0, footnote: 0 }
  scanMarkup(text, 0, text.length, 'body', counter)
  return counter.body
}

function addWord(counter: Counter, sink: 'body' | 'footnote'): void {
  counter[sink] += 1
}

function scanMarkup(
  src: string,
  from: number,
  to: number,
  sink: 'body' | 'footnote',
  counter: Counter,
): void {
  let i = from
  let lineStart = true
  while (i < to) {
    const ch = src[i]!
    if (lineStart) lineStart = false
    if (ch === '\n') {
      lineStart = true
      i += 1
      continue
    }
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      i = skipBlockComment(src, i, to)
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < to && src[i] !== '\n') i += 1
      continue
    }
    if (ch === '$') {
      i = skipUntil(src, i + 1, to, '$')
      continue
    }
    if (ch === '`') {
      let run = 1
      while (src[i + run] === '`') run += 1
      const fence = '`'.repeat(run)
      const end = src.indexOf(fence, i + run)
      i = end < 0 || end >= to ? to : end + run
      continue
    }
    if (ch === 'h' && (src.startsWith('http://', i) || src.startsWith('https://', i))) {
      const match = URL_START.exec(src.slice(i, to))
      if (match) {
        addWord(counter, sink)
        i += match[0].length
        continue
      }
    }
    if (ch === '#') {
      i = scanExpression(src, i, to, sink, counter)
      continue
    }
    if (ch === '@' && KEY_CHAR.test(src[i + 1] ?? '')) {
      let j = i + 1
      while (
        j < to &&
        (KEY_CHAR.test(src[j]!) ||
          ((src[j] === ':' || src[j] === '.') && KEY_CHAR.test(src[j + 1] ?? '')))
      )
        j += 1
      addWord(counter, sink)
      i = src[j] === '[' ? skipContent(src, j, to) : j
      continue
    }
    if (ch === '<') {
      const match = /^<[\p{L}\p{N}_:.-]+>/u.exec(src.slice(i, i + 80))
      if (match) {
        i += match[0].length
        continue
      }
    }
    if (WORD_CHAR.test(ch)) {
      let j = i + 1
      while (j < to) {
        const c = src[j]!
        if (WORD_CHAR.test(c)) j += 1
        else if ((c === "'" || c === '’' || c === '-') && WORD_CHAR.test(src[j + 1] ?? '')) j += 1
        else break
      }
      addWord(counter, sink)
      i = j
      continue
    }
    i += 1
  }
}

function scanExpression(
  src: string,
  start: number,
  to: number,
  sink: 'body' | 'footnote',
  counter: Counter,
): number {
  let i = start + 1
  const first = src[i] ?? ''
  if (first === '(' || first === '{') return skipCode(src, i, to)
  if (!IDENT_START.test(first)) return i
  let j = i
  while (
    j < to &&
    (IDENT_CHAR.test(src[j]!) || (src[j] === '.' && IDENT_START.test(src[j + 1] ?? '')))
  )
    j += 1
  const name = src.slice(i, j)
  if (CODE_LINE_KEYWORDS.has(name)) return skipCodeLine(src, j, to)
  i = j
  if (src[i] === '(') i = skipCode(src, i, to)
  if (name === 'cite') addWord(counter, sink)
  while (src[i] === '[') {
    const end = skipContent(src, i, to)
    scanMarkup(
      src,
      i + 1,
      Math.max(i + 1, end - 1),
      name === 'footnote' ? 'footnote' : sink,
      counter,
    )
    i = end
  }
  return i
}

function skipBlockComment(src: string, start: number, to: number): number {
  let depth = 0
  let i = start
  while (i < to) {
    if (src[i] === '/' && src[i + 1] === '*') {
      depth += 1
      i += 2
    } else if (src[i] === '*' && src[i + 1] === '/') {
      depth -= 1
      i += 2
      if (depth === 0) return i
    } else i += 1
  }
  return to
}

function skipUntil(src: string, from: number, to: number, close: string): number {
  let i = from
  while (i < to) {
    if (src[i] === '\\') i += 2
    else if (src[i] === close) return i + 1
    else i += 1
  }
  return to
}

/** `src[start]` is "[": returns the index after the matching "]". Quotes are plain text here. */
function skipContent(src: string, start: number, to: number): number {
  let depth = 0
  let i = start
  while (i < to) {
    const ch = src[i]
    if (ch === '\\') i += 2
    else if (ch === '/' && src[i + 1] === '*') i = skipBlockComment(src, i, to)
    else {
      if (ch === '[') depth += 1
      else if (ch === ']') {
        depth -= 1
        if (depth === 0) return i + 1
      }
      i += 1
    }
  }
  return to
}

/** `src[start]` is "(" or "{": returns the index after the matching closer. Strings are skipped
 * and content blocks inside are skipped as content. */
function skipCode(src: string, start: number, to: number): number {
  const closer = src[start] === '(' ? ')' : '}'
  let i = start + 1
  while (i < to) {
    const ch = src[i]!
    if (ch === '"') i = skipUntil(src, i + 1, to, '"')
    else if (ch === '(' || ch === '{') i = skipCode(src, i, to)
    else if (ch === '[') i = skipContent(src, i, to)
    else if (ch === closer) return i + 1
    else if (ch === '/' && src[i + 1] === '*') i = skipBlockComment(src, i, to)
    else if (ch === '/' && src[i + 1] === '/') while (i < to && src[i] !== '\n') i += 1
    else i += 1
  }
  return to
}

function skipCodeLine(src: string, from: number, to: number): number {
  let i = from
  while (i < to && src[i] !== '\n') {
    const ch = src[i]!
    if (ch === '"') i = skipUntil(src, i + 1, to, '"')
    else if (ch === '(' || ch === '{') i = skipCode(src, i, to)
    else if (ch === '[') i = skipContent(src, i, to)
    else i += 1
  }
  return i
}
