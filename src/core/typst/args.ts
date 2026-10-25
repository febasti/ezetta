/**
 * A small, tolerant reader for the argument list of a Typst call, such as the `( … )` of
 * `#figure(image("a.png", width: 80%), caption: [Text])`. It finds each argument's extent, and its
 * name when it has one, so single arguments can be read and changed in place. Arguments it does not
 * know are never touched, which is how figure arguments the app has no field for (placement,
 * supplement) survive an edit.
 */

export interface Arg {
  /** The name of a named argument (`width` in `width: 80%`), or null for a positional one. */
  name: string | null
  /** The whole argument, without the comma and the whitespace around it. */
  from: number
  to: number
  /** The value: the part after `name:`, or the whole argument. */
  valueFrom: number
  valueTo: number
}

const NAME = /^([\p{L}_][\p{L}\p{N}_-]*)[ \t\r\n]*:(?!:)/u

/** Index after the string that starts at `from` (a double quote), or -1. */
function skipString(text: string, from: number, end: number): number {
  for (let i = from + 1; i < end; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '"') return i + 1
  }
  return -1
}

/** Index after the bracket group (`(`, `[`, or `{`) that starts at `from`, or -1. */
export function skipGroup(text: string, from: number, end: number, depth = 0): number {
  if (depth > 100) return -1
  const close = text[from] === '(' ? ')' : text[from] === '[' ? ']' : '}'
  let i = from + 1
  while (i < end) {
    const c = text[i]!
    if (c === '\\') i += 2
    else if (c === '"') {
      const next = skipString(text, i, end)
      if (next < 0) return -1
      i = next
    } else if (c === '`' || c === '$') {
      const found = text.indexOf(c, i + 1)
      i = found > 0 && found < end ? found + 1 : i + 1
    } else if (c === '(' || c === '[' || c === '{') {
      const next = skipGroup(text, i, end, depth + 1)
      if (next < 0) return -1
      i = next
    } else if (c === close) return i + 1
    else i += 1
  }
  return -1
}

/** The arguments between `open` (index of "(") and `close` (index of the matching ")"). */
export function parseArgs(text: string, open: number, close: number): Arg[] {
  const args: Arg[] = []
  const push = (start: number, end: number): void => {
    let from = start
    let to = end
    while (from < to && /\s/.test(text[from]!)) from += 1
    while (to > from && /\s/.test(text[to - 1]!)) to -= 1
    if (to <= from) return
    const named = NAME.exec(text.slice(from, to))
    if (named) {
      let valueFrom = from + named[0].length
      while (valueFrom < to && /\s/.test(text[valueFrom]!)) valueFrom += 1
      args.push({ name: named[1]!, from, to, valueFrom, valueTo: to })
    } else args.push({ name: null, from, to, valueFrom: from, valueTo: to })
  }
  let start = open + 1
  let i = open + 1
  while (i < close) {
    const c = text[i]!
    if (c === ',') {
      push(start, i)
      start = i + 1
      i += 1
    } else if (c === '"') {
      const next = skipString(text, i, close)
      i = next < 0 ? close : next
    } else if (c === '(' || c === '[' || c === '{') {
      const next = skipGroup(text, i, close)
      i = next < 0 ? close : next
    } else if (c === '\\') i += 2
    else i += 1
  }
  push(start, close)
  return args
}

export interface Call {
  /** Name of the function, for example `image`. */
  name: string
  /** Index of the "(" and of the matching ")". */
  open: number
  close: number
}

/** Reads `name(…)` out of a value, when the whole value is exactly one call. */
export function callIn(text: string, from: number, to: number): Call | null {
  const match = /^([\p{L}_][\p{L}\p{N}_.-]*)\(/u.exec(text.slice(from, to))
  if (!match) return null
  const open = from + match[0].length - 1
  const end = skipGroup(text, open, to)
  return end === to ? { name: match[1]!, open, close: to - 1 } : null
}

/** The text of a string argument such as `"assets/a.png"`, or null. */
export function stringValue(text: string, from: number, to: number): string | null {
  const raw = text.slice(from, to)
  if (raw.length < 2 || raw[0] !== '"' || skipString(raw, 0, raw.length) !== raw.length) return null
  return raw.slice(1, -1).replace(/\\(.)/g, '$1')
}

/** A Typst string literal for `value`. */
export const typstString = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

/**
 * True if the square brackets of `text` pair up, so it can stand as content in `[…]` without
 * swallowing the text after it. An escaped bracket (`\]`) is text and does not count.
 */
export const balanced = (text: string): boolean => {
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') i += 1
    else if (ch === '[') depth += 1
    else if (ch === ']' && --depth < 0) return false
  }
  return depth === 0
}
