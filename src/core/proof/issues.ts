import type { ProofUnit } from './extract'

/**
 * What the checker found, turned into issues in the source, and the rules that keep some
 * of them out: words of the dictionaries, rules and categories the writer turned off, and
 * occurrences the writer chose to ignore.
 */

export type ProofCategory = 'spelling' | 'grammar' | 'style' | 'typography'

/** One match of LanguageTool's `/v2/check`, as far as the app reads it. */
export interface CheckerMatch {
  offset: number
  length: number
  message: string
  shortMessage?: string
  replacements: { value: string }[]
  rule: {
    id: string
    description: string
    issueType?: string
    category: { id: string; name: string }
  }
}

/** How much text on each side of an issue its `context` holds, at most. */
export const CONTEXT_CHARS = 40

export interface ProofIssue {
  /** Where the issue is in the source. */
  from: number
  to: number
  message: string
  shortMessage: string
  replacements: string[]
  ruleId: string
  ruleDescription: string
  categoryId: string
  category: ProofCategory
  /** The text the issue covers. */
  text: string
  /** The sentence or line around it, for the list of issues. */
  context: string
  footnote: boolean
}

/**
 * The context of an issue split around the words it covers, for the list. The context is cut after
 * a fixed number of characters, which may be in the middle of a word: a cut end loses its partial
 * word and gets an ellipsis.
 */
export function contextParts(
  issue: Pick<ProofIssue, 'context' | 'text'>,
): [string, string, string] {
  const at = issue.context.indexOf(issue.text)
  if (at < 0) return ['', issue.text, '']
  let before = issue.context.slice(0, at)
  let after = issue.context.slice(at + issue.text.length)
  if (before.length >= CONTEXT_CHARS) {
    const space = before.search(/\s/)
    before = space < 0 ? '… ' : `… ${before.slice(space).trimStart()}`
  }
  if (after.length >= CONTEXT_CHARS) {
    const space = after.search(/\s\S*$/)
    after = space < 0 ? ' …' : `${after.slice(0, space).trimEnd()} …`
  }
  return [before, issue.text, after]
}

const STYLE_TYPES = new Set(['style', 'register', 'locale-violation', 'hint'])
const TYPOGRAPHY_TYPES = new Set(['typographical', 'whitespace'])

export function categoryOf(match: CheckerMatch): ProofCategory {
  const type = match.rule.issueType ?? ''
  if (type === 'misspelling' || match.rule.category.id === 'TYPOS') return 'spelling'
  if (TYPOGRAPHY_TYPES.has(type) || match.rule.category.id === 'TYPOGRAPHY') return 'typography'
  if (
    STYLE_TYPES.has(type) ||
    ['STYLE', 'REDUNDANCY', 'COLLOQUIALISMS'].includes(match.rule.category.id)
  )
    return 'style'
  return 'grammar'
}

const MAX_REPLACEMENTS = 8
/** Characters that would start markup if a suggestion put them into the text. */
const TYPST_SPECIAL = /[#*_$@\\`<>[\]]/

/** The runs of a unit that are markup, as offsets from the start of the unit. */
function markupRanges(unit: ProofUnit): [number, number][] {
  const out: [number, number][] = []
  let at = 0
  for (const part of unit.annotation) {
    const text = 'text' in part ? part.text : part.markup
    if ('markup' in part) out.push([at, at + text.length])
    at += text.length
  }
  return out
}

/** The issues of one unit, with positions in the source. */
export function issuesOf(
  unit: ProofUnit,
  matches: readonly CheckerMatch[],
  doc: string,
): ProofIssue[] {
  const markup = markupRanges(unit)
  const out: ProofIssue[] = []
  for (const match of matches) {
    const start = match.offset
    const end = match.offset + match.length
    if (match.length <= 0 || end > unit.to - unit.from) continue
    // A match that lies wholly in a stand-in (a citation, a formula) is about the stand-in.
    if (markup.some(([a, b]) => a <= start && end <= b)) continue
    const from = unit.from + start
    const to = unit.from + end
    const lineStart = doc.lastIndexOf('\n', from - 1) + 1
    const lineEndAt = doc.indexOf('\n', to)
    out.push({
      from,
      to,
      message: match.message,
      shortMessage: match.shortMessage || match.rule.category.name,
      // A suggestion would replace the markup the issue covers, or add markup of its own.
      replacements: markup.some(([a, b]) => a < end && start < b)
        ? []
        : match.replacements
            .map((r) => r.value)
            .filter((value) => !TYPST_SPECIAL.test(value))
            .slice(0, MAX_REPLACEMENTS),
      ruleId: match.rule.id,
      ruleDescription: match.rule.description,
      categoryId: match.rule.category.id,
      category: categoryOf(match),
      text: doc.slice(from, to),
      context: doc.slice(
        Math.max(lineStart, from - CONTEXT_CHARS),
        Math.min(lineEndAt < 0 ? doc.length : lineEndAt, to + CONTEXT_CHARS),
      ),
      footnote: unit.footnote,
    })
  }
  return out
}

export interface IssueFilter {
  /** Words of the personal and the project dictionary. */
  words: ReadonlySet<string>
  disabledRules: ReadonlySet<string>
  disabledCategories: ReadonlySet<ProofCategory>
  /** Occurrences ignored for this session, by `ignoreKey`. */
  ignored: ReadonlySet<string>
}

/** What identifies an occurrence that was ignored: the rule, the words, and what is around them. */
export const ignoreKey = (issue: Pick<ProofIssue, 'ruleId' | 'text' | 'context'>): string =>
  `${issue.ruleId}\u0000${issue.text}\u0000${issue.context}`

export function keepIssue(issue: ProofIssue, filter: IssueFilter): boolean {
  if (filter.disabledRules.has(issue.ruleId)) return false
  if (filter.disabledCategories.has(issue.category)) return false
  if (filter.ignored.has(ignoreKey(issue))) return false
  if (issue.category === 'spelling') {
    const word = issue.text.trim()
    if (filter.words.has(word) || filter.words.has(word.toLowerCase())) return false
  }
  return true
}

// --- dictionaries ---------------------------------------------------------------------------------

/** The words of a dictionary file: one per line, blank lines and `#` comments left out. */
export function parseDictionary(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/** The dictionary file with a word added (sorted lines stay as they are), or null if it is there already. */
export function withWord(text: string, word: string): string | null {
  const clean = word.trim()
  if (clean === '' || /[\r\n]/.test(clean) || clean.startsWith('#')) return null
  if (parseDictionary(text).includes(clean)) return null
  const body = text === '' || text.endsWith('\n') ? text : `${text}\n`
  return `${body}${clean}\n`
}

// --- language -------------------------------------------------------------------------------------

export const LANGUAGE_VARIANTS = [
  'de-DE',
  'de-AT',
  'de-CH',
  'en-GB',
  'en-US',
  'en-AU',
  'en-CA',
] as const

/** The checker's language: the proofing setting, or the project language with its usual variant. */
export function checkerLanguage(projectLanguage: string, override?: string): string {
  if (override && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(override)) return override
  const base = projectLanguage.toLowerCase()
  if (/^[a-z]{2,3}-[a-z]{2}$/.test(base)) {
    const [lang, region] = base.split('-')
    return `${lang}-${region!.toUpperCase()}`
  }
  if (base.startsWith('de')) return 'de-DE'
  if (base.startsWith('en')) return 'en-GB'
  return base
}
