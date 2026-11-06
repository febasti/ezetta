/**
 * Text pasted from another program, as paragraphs Typst reads the same way: an empty line between
 * two paragraphs and no line break inside one, and nothing in it read as markup. Plain text keeps its empty lines as the breaks
 * between paragraphs, and every other line break becomes a space (text copied from a PDF breaks
 * its lines where the page did). Formatted text (from a word processor or a web page) brings its
 * paragraphs with it, as the blocks of its HTML. Nothing is guessed from the words themselves.
 */

/** Plain text: empty lines end paragraphs, a single line break is a space. */
export function plainParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n\s*/)
    .map((block) => block.replace(/[ \t]*\n[ \t]*/g, ' ').trim())
    .filter((block) => block !== '')
}

/** Elements that are blocks of their own: each ends one paragraph and starts the next. */
const BLOCK =
  /^(p|div|h[1-6]|li|ul|ol|dl|dt|dd|blockquote|pre|table|tr|thead|tbody|section|article|header|footer|aside|figure|figcaption|address|hr)$/

/** Elements whose content is not text the writer sees. */
const HIDDEN = /<(style|script|head|title|xml|template)\b[\s\S]*?<\/\1\s*>/gi

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  shy: '',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * The paragraphs of HTML from the clipboard: the text of each block element, with its white space
 * as the browser shows it (a run of spaces and line breaks is one space, a `<br>` too; a no-break
 * space stays one). Comments, styles and the like are left out. Empty blocks are dropped.
 */
export function htmlParagraphs(html: string): string[] {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(HIDDEN, '')
  const out: string[] = []
  let current = ''
  const flush = (): void => {
    const text = current.replace(/[ \t\r\n\f]+/g, ' ').trim()
    if (text !== '') out.push(text)
    current = ''
  }
  for (const match of source.matchAll(/<\/?([a-zA-Z][\w:-]*)[^>]*>|[^<]+|</g)) {
    const tag = match[1]?.toLowerCase()
    if (tag === undefined) current += decode(match[0])
    else if (BLOCK.test(tag)) flush()
    else if (tag === 'br' || tag === 'td' || tag === 'th') current += ' '
  }
  flush()
  return out
}

/** A web or mail address in the text: Typst makes it a link, so its characters stay as they are. */
const ADDRESS = /https?:\/\/[^\s<>"[\]]+/g

/**
 * The characters of a run of text that Typst would read as markup, escaped with a backslash so they
 * print as typed: code (`#`), strong and emphasis, math, references and labels, raw text, the
 * no-break space, brackets, the escape itself, comments (`//`, `/*`), and the app's highlight
 * (`::`).
 */
const escapeRun = (text: string): string =>
  text
    .replace(/[\\#*_$@<`~[\]]/g, '\\$&')
    .replace(/\/(?=[/*])/g, '\\/')
    .replace(/::/g, ':\\:')

/**
 * A text from another program as Typst markup that prints it as it is: what would be markup is
 * escaped (addresses excepted), and at the start of a line a heading, a list item, a numbered item
 * or a term (`=`, `-`, `+`, `1.`, `/` before a space) is too.
 */
export function escapeMarkup(text: string, atLineStart: boolean): string {
  let out = ''
  let at = 0
  for (const match of text.matchAll(ADDRESS)) {
    out += escapeRun(text.slice(at, match.index)) + match[0]
    at = match.index + match[0].length
  }
  out += escapeRun(text.slice(at))
  if (!atLineStart) return out
  return out.replace(/^(\s*)(\d+)\.(?=\s)/, '$1$2\\.').replace(/^(\s*)([=+/-])(?=[=\s])/, '$1\\$2')
}

/**
 * What a paste from another program writes: its paragraphs behind empty lines, from the HTML when
 * the clipboard has some with more than one, else from the plain text, and every character that
 * would be markup escaped. Text on one line keeps its spaces. `atLineStart` says whether the paste
 * starts a line (its first characters could then make a heading or a list). Null when this is the
 * plain text as it is, so the editor pastes it itself.
 */
export function pastedText(
  plain: string,
  html: string | null,
  atLineStart: boolean,
): string | null {
  const fromHtml = html ? htmlParagraphs(html) : []
  const several = /[\r\n]/.test(plain) || fromHtml.length > 1
  const blocks = several ? (fromHtml.length > 0 ? fromHtml : plainParagraphs(plain)) : [plain]
  if (blocks.length === 0) return null
  const text = blocks.map((block, i) => escapeMarkup(block, atLineStart || i > 0)).join('\n\n')
  return text === plain ? null : text
}
