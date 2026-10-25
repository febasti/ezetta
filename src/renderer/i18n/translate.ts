import de from './de.json'
import en from './en.json'

export type Locale = 'de' | 'en'
export type MessageKey = keyof typeof de
export type Messages = Record<MessageKey, string>

export const LOCALES: readonly Locale[] = ['de', 'en']
export const messages: Record<Locale, Messages> = { de, en }

const rules = new Map<Locale, Intl.PluralRules>()
const pluralRules = (locale: Locale): Intl.PluralRules => {
  let found = rules.get(locale)
  if (!found) rules.set(locale, (found = new Intl.PluralRules(locale)))
  return found
}

/** The index after the brace that closes the one opened just before `from`. */
function closing(text: string, from: number): number {
  let depth = 1
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}' && --depth === 0) return i + 1
  }
  return text.length
}

/**
 * The form of a plural for a value: `one {# Abschnitt} other {# Abschnitte}`, with `=0 {…}` for an
 * exact number. The language's own rules choose (`Intl.PluralRules`); `#` is the value as given (it
 * may come formatted, "1.204": the rules see the number in it).
 */
function plural(locale: Locale, cases: string, value: string | number): string {
  const forms = new Map<string, string>()
  const pattern = /\s*(=?\w+)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cases))) {
    const end = closing(cases, pattern.lastIndex)
    forms.set(match[1]!, cases.slice(pattern.lastIndex, end - 1))
    pattern.lastIndex = end
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d,.-]/g, ''))
  const form = forms.get(`=${n}`) ?? forms.get(pluralRules(locale).select(n)) ?? forms.get('other')
  return (form ?? '').replace(/#/g, String(value))
}

function format(locale: Locale, text: string, params: Record<string, string | number>): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    out += text.slice(i, open)
    const end = closing(text, open + 1)
    const inner = text.slice(open + 1, end - 1)
    const plain = /^(\w+)$/.exec(inner)
    const counted = /^(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner)
    if (plain) out += plain[1]! in params ? String(params[plain[1]!]) : `{${inner}}`
    else if (counted && counted[1]! in params)
      out += format(locale, plural(locale, counted[2]!, params[counted[1]!]!), params)
    else out += `{${inner}}`
    i = end
  }
  return out + text.slice(i)
}

/**
 * Looks up a message and fills `{name}` placeholders. A count says its noun in the right form with
 * `{count, plural, one {# Abschnitt} other {# Abschnitte}}`.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  return format(locale, messages[locale][key], params)
}

export function detectLocale(languages: readonly string[]): Locale {
  return languages.some((language) => language.toLowerCase().startsWith('de')) ? 'de' : 'en'
}
