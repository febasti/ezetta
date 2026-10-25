/**
 * Find and replace in plain text (search matches the source text). Pure functions, so the
 * editor and, later, a search across sheets use the same rules.
 */

export interface SearchOptions {
  query: string
  caseSensitive: boolean
  /** Only matches that are not part of a longer word. */
  wholeWord: boolean
  /** The query is a regular expression (JavaScript syntax), and a replacement may use `$1`. */
  regexp: boolean
}

export interface TextMatch {
  from: number
  to: number
}

export interface SearchResult {
  matches: TextMatch[]
  /** The query is not a valid regular expression. */
  invalid: boolean
  /** There were more matches than the limit; the rest are not listed. */
  truncated: boolean
}

/** Matches the editor lists and draws at most. */
export const MATCH_LIMIT = 5000

const WORD_CHAR = '[\\p{L}\\p{N}_]'
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** The expression for the options, or null for an empty or invalid query. */
export function compileSearch(options: SearchOptions): RegExp | null {
  if (options.query === '') return null
  const source = options.regexp ? options.query : escapeRegExp(options.query)
  const wrapped = options.wholeWord ? `(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})` : source
  try {
    return new RegExp(wrapped, `gu${options.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

/** All matches in `text`, in order. A match that is empty (`a*` between letters) is skipped. */
export function findMatches(
  text: string,
  options: SearchOptions,
  limit = MATCH_LIMIT,
): SearchResult {
  const regex = compileSearch(options)
  if (!regex) return { matches: [], invalid: options.query !== '', truncated: false }
  const matches: TextMatch[] = []
  for (let m = regex.exec(text); m; m = regex.exec(text)) {
    if (m[0] === '') {
      regex.lastIndex += 1
      continue
    }
    if (matches.length >= limit) return { matches, invalid: false, truncated: true }
    matches.push({ from: m.index, to: m.index + m[0].length })
  }
  return { matches, invalid: false, truncated: false }
}

/**
 * Fills `$&`, `$1`, `$<name>`, and `$$` of a replacement from a regular expression match. A group
 * number that does not exist stays as typed.
 */
function expand(template: string, m: RegExpExecArray): string {
  return template.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (all, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return m[0]
    if (token.startsWith('<')) return m.groups?.[token.slice(1, -1)] ?? ''
    const two = Number(token)
    if (token.length === 2 && two >= m.length) {
      const one = Number(token[0])
      return one >= 1 && one < m.length ? (m[one] ?? '') + token[1]! : all
    }
    return two >= 1 && two < m.length ? (m[two] ?? '') : all
  })
}

/** The text that replaces `match`: the replacement as typed, or expanded in regular expression mode. */
export function replacementFor(
  text: string,
  match: TextMatch,
  options: SearchOptions,
  replacement: string,
): string {
  if (!options.regexp) return replacement
  const regex = compileSearch(options)
  if (!regex) return replacement
  const sticky = new RegExp(regex.source, regex.flags.replace('g', '') + 'y')
  sticky.lastIndex = match.from
  const m = sticky.exec(text)
  return m && m.index === match.from ? expand(replacement, m) : replacement
}

export interface Replacement {
  from: number
  to: number
  insert: string
}

/** Replacements for the given matches, in the coordinates of `text`. */
export function replacementsFor(
  text: string,
  matches: readonly TextMatch[],
  options: SearchOptions,
  replacement: string,
): Replacement[] {
  return matches.map((m) => ({
    from: m.from,
    to: m.to,
    insert: replacementFor(text, m, options, replacement),
  }))
}
