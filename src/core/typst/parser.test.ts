import type { Tree } from '@lezer/common'
import { describe, expect, it } from 'vitest'
import { parseTypst } from './parser'

/** Compact view of a tree: Name(children) with the source of leaves, for readable assertions. */
function show(tree: Tree, text: string): string {
  const parts: string[] = []
  const walk = (cursor: ReturnType<Tree['cursor']>): void => {
    const name = cursor.name
    if (cursor.firstChild()) {
      const inner: string[] = []
      do {
        const before = parts.length
        walk(cursor)
        inner.push(...parts.splice(before))
      } while (cursor.nextSibling())
      cursor.parent()
      parts.push(`${name}(${inner.join(' ')})`)
    } else parts.push(`${name}[${text.slice(cursor.from, cursor.to)}]`)
  }
  const cursor = tree.cursor()
  if (cursor.firstChild()) {
    do walk(cursor)
    while (cursor.nextSibling())
  }
  return parts.join(' ')
}
const p = (text: string): string => show(parseTypst(text), text)
const names = (text: string): string[] => {
  const out: string[] = []
  parseTypst(text).iterate({ enter: (n) => void (n.name !== 'Document' && out.push(n.name)) })
  return out
}

describe('headings and lists', () => {
  it('parses headings with their level marker', () => {
    expect(p('= Titel')).toBe('Heading(HeadingMark[=])')
    expect(p('=== Tief <sec-a>')).toBe('Heading(HeadingMark[===] Label[<sec-a>])')
  })

  it('needs a space after the marker, and only at the start of a line', () => {
    expect(names('=kein Titel')).toEqual([])
    expect(names('Text = Gleichheit')).toEqual([])
  })

  it('parses bullet and numbered items, with indentation', () => {
    expect(p('- eins\n+ zwei\n  - tief')).toBe(
      'ListItem(ListMark[-]) ListItem(ListMark[+]) ListItem(ListMark[-])',
    )
  })

  it('lets a list item continue on deeper-indented lines', () => {
    const text = '- erste Zeile\n  zweite _Zeile_\n- nächster'
    const tree = parseTypst(text)
    const items: [number, number][] = []
    tree.iterate({ enter: (n) => void (n.name === 'ListItem' && items.push([n.from, n.to])) })
    expect(items).toEqual([
      [0, 30],
      [31, 41],
    ])
    expect(names(text)).toContain('Emphasis')
  })

  it('does not treat a dash inside text as a list', () => {
    expect(names('Wort - Wort')).toEqual([])
    expect(names('-kein Punkt')).toEqual([])
  })
})

describe('emphasis, strong, highlight', () => {
  it('parses the documented forms', () => {
    expect(p('_betont_ und *wichtig*')).toBe(
      'Emphasis(EmphasisMark[_] EmphasisMark[_]) Strong(StrongMark[*] StrongMark[*])',
    )
    expect(p('Die ::Probe:: war')).toBe('Highlight(HighlightMark[::] HighlightMark[::])')
  })

  it('nests different kinds', () => {
    expect(p('*a _b_ c*')).toBe(
      'Strong(StrongMark[*] Emphasis(EmphasisMark[_] EmphasisMark[_]) StrongMark[*])',
    )
    expect(names('::a *b*::')).toEqual([
      'Highlight',
      'HighlightMark',
      'Strong',
      'StrongMark',
      'StrongMark',
      'HighlightMark',
    ])
  })

  it('leaves underscores inside words alone', () => {
    expect(names('snake_case_name und a*b*c')).toEqual([])
  })

  it('requires non-space after the opener and before the closer', () => {
    expect(names('_ nein_')).toEqual([])
    expect(names('_nein _')).toEqual([])
    expect(names('2 * 3 * 4')).toEqual([])
  })

  it('leaves an unclosed delimiter as plain text', () => {
    expect(names('_nie geschlossen')).toEqual([])
    expect(names('*auch nicht\n\nund _hier_ schon')).toEqual([
      'Emphasis',
      'EmphasisMark',
      'EmphasisMark',
    ])
  })

  it('never crosses a blank line or the start of another block', () => {
    expect(names('_a\n\nb_')).toEqual([])
    expect(names('_a\n- b_')).toEqual(['ListItem', 'ListMark'])
  })

  it('may continue over a single line break', () => {
    expect(names('_a\nb_')).toEqual(['Emphasis', 'EmphasisMark', 'EmphasisMark'])
  })

  it('lets an inner failure fall back when an outer delimiter closes first', () => {
    expect(names('*a _b* c_')).toEqual(['Strong', 'StrongMark', 'StrongMark'])
  })

  it('does not open the same kind inside itself', () => {
    expect(names('_a _b_ c_')).toEqual(['Emphasis', 'EmphasisMark', 'EmphasisMark'])
  })

  it('parses highlights per the spec: non-space inside both edges', () => {
    expect(names('::a::')).toEqual(['Highlight', 'HighlightMark', 'HighlightMark'])
    expect(names(':: a::')).toEqual([])
    expect(names('::a ::')).toEqual([])
    expect(names('::a\n\nb::')).toEqual([])
  })
})

describe('comments', () => {
  it('parses line and block comments, including nested ones', () => {
    expect(p('a // Rest\nb')).toBe('LineComment[// Rest]')
    expect(p('a /* x /* y */ z */ b')).toBe('BlockComment[/* x /* y */ z */]')
    expect(names('a /* offen')).toEqual([])
  })

  it('does not start a comment inside a URL', () => {
    expect(p('Siehe https://example.org/a//b hier')).toBe('Url[https://example.org/a//b]')
    expect(names('file://x')).toEqual([])
  })

  it('treats markup inside a comment as comment text', () => {
    expect(names('/* _kein Emphasis_ und #f( */')).toEqual(['BlockComment'])
  })

  it('spans lines for block comments', () => {
    const tree = parseTypst('a /* x\ny */ b')
    let range: [number, number] = [0, 0]
    tree.iterate({ enter: (n) => void (n.name === 'BlockComment' && (range = [n.from, n.to])) })
    expect(range).toEqual([2, 11])
  })
})

describe('atoms', () => {
  it('parses URLs without trailing punctuation', () => {
    expect(p('Lies https://example.org/x.')).toBe('Url[https://example.org/x]')
    expect(p('(siehe http://a.example/b)')).toBe('Url[http://a.example/b]')
    expect(names('http://')).toEqual([])
  })

  it('parses labels, references, and supplements', () => {
    expect(p('siehe @fig-a und @smith2020[S. 14].')).toBe('Ref[@fig-a] Ref(Supplement[[S. 14]])')
    expect(p('Text <sec-intro>')).toBe('Label[<sec-intro>]')
    expect(names('mail a@b.example')).toEqual([])
  })

  it('parses math and raw text as opaque', () => {
    expect(p('Die Größe $x^2 _a_$ wächst')).toBe('Math[$x^2 _a_$]')
    expect(p('Ein `code _x_` Span')).toBe('Raw[`code _x_`]')
    expect(p('```\nzeile _a_\n```')).toBe('Raw[```\nzeile _a_\n```]')
    expect(names('$ offen')).toEqual([])
    expect(names('`offen')).toEqual([])
  })

  it('parses escapes', () => {
    expect(p('\\_kein\\_ \\#nein')).toBe('Escape[\\_] Escape[\\_] Escape[\\#]')
  })
})

describe('expressions', () => {
  it('parses a function call with content', () => {
    expect(p('Text#footnote[Eine Notiz.]')).toBe(
      'Expression(Hash[#] FuncName[footnote] Content(ContentMark[[] ContentMark[]]))',
    )
  })

  it('parses arguments as one opaque node and content as markup', () => {
    expect(p('#quote(block: true)[Ein _Satz_.]')).toBe(
      'Expression(Hash[#] FuncName[quote] Args[(block: true)] Content(ContentMark[[] Emphasis(EmphasisMark[_] EmphasisMark[_]) ContentMark[]]))',
    )
  })

  it('keeps multi-line figures with nested content and strings together', () => {
    const text =
      '#figure(\n  image("assets/a.png", width: 80%),\n  caption: [Eine "Beschriftung" mit ]x],\n) <fig-a>\nNach'
    const out = names(text)
    expect(out.slice(0, 4)).toEqual(['Expression', 'Hash', 'FuncName', 'Args'])
    expect(out).toContain('Label')
  })

  it('treats code lines as opaque', () => {
    expect(p('#set text(size: 12pt)\nEin _Satz_')).toBe(
      'CodeLine(Hash[#] FuncName[set]) Emphasis(EmphasisMark[_] EmphasisMark[_])',
    )
  })

  it('falls back to text for unbalanced arguments', () => {
    expect(p('#f( offen')).toBe('Expression(Hash[#] FuncName[f])')
    expect(names('# nichts und #')).toEqual([])
  })

  it('parses links', () => {
    expect(p('#link("https://example.org")[Text]')).toBe(
      'Expression(Hash[#] FuncName[link] Args[("https://example.org")] Content(ContentMark[[] ContentMark[]]))',
    )
  })

  it('parses nested content', () => {
    expect(names('#a[x #b[y] z]')).toEqual([
      'Expression',
      'Hash',
      'FuncName',
      'Content',
      'ContentMark',
      'Expression',
      'Hash',
      'FuncName',
      'Content',
      'ContentMark',
      'ContentMark',
      'ContentMark',
    ])
  })
})

describe('robustness', () => {
  it('handles empty and whitespace-only input', () => {
    expect(parseTypst('').length).toBe(0)
    expect(names('  \n\n \t')).toEqual([])
  })

  it('handles CRLF line endings', () => {
    expect(p('= Titel\r\n\r\n_a_\r\n- b')).toBe(
      'Heading(HeadingMark[=]) Emphasis(EmphasisMark[_] EmphasisMark[_]) ListItem(ListMark[-])',
    )
  })

  it('is fast on long input with many unmatched delimiters', () => {
    const text = '*a _b ::c '.repeat(20000)
    const start = Date.now()
    parseTypst(text)
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('does not end a content block at a bracket inside raw text or math', () => {
    expect(names('#f[a `x ]` b]')).toEqual([
      'Expression',
      'Hash',
      'FuncName',
      'Content',
      'ContentMark',
      'Raw',
      'ContentMark',
    ])
    expect(names('#f[a $x]$ b]')).toEqual([
      'Expression',
      'Hash',
      'FuncName',
      'Content',
      'ContentMark',
      'Math',
      'ContentMark',
    ])
    // A lone backtick or dollar sign is only a character.
    expect(names('#f[5 $ ] x')).toEqual([
      'Expression',
      'Hash',
      'FuncName',
      'Content',
      'ContentMark',
      'ContentMark',
    ])
  })

  it('survives very deep nesting', () => {
    expect(() => parseTypst('#f('.repeat(5000) + ')'.repeat(5000))).not.toThrow()
    expect(() => parseTypst('#f['.repeat(5000) + ']'.repeat(5000))).not.toThrow()
  })

  it('keeps every node in bounds, ordered, and inside its parent (fuzz)', () => {
    const alphabet = [
      '_',
      '*',
      '::',
      ':',
      '#',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '"',
      '\\',
      '$',
      '`',
      '/',
      '//',
      '/*',
      '*/',
      '<',
      '>',
      '@',
      '=',
      '- ',
      '+ ',
      '\n',
      '\n\n',
      ' ',
      'a',
      'b',
      'ä',
      'http://x.y',
      '#f',
      '#set ',
      '#quote(block: true)[',
      '<l>',
      '@k',
    ]
    let seed = 12345
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let round = 0; round < 1500; round += 1) {
      const length = Math.floor(random() * 40)
      let text = ''
      for (let i = 0; i < length; i += 1) text += alphabet[Math.floor(random() * alphabet.length)]!
      const tree = parseTypst(text)
      expect(tree.length).toBe(text.length)
      const check = (
        cursor: ReturnType<Tree['cursor']>,
        parentFrom: number,
        parentTo: number,
      ): void => {
        expect(cursor.from, text).toBeGreaterThanOrEqual(parentFrom)
        expect(cursor.to, text).toBeLessThanOrEqual(parentTo)
        expect(cursor.to, text).toBeGreaterThanOrEqual(cursor.from)
        if (cursor.firstChild()) {
          let last = cursor.from
          const from = cursor.from
          void from
          const parentStart = cursor.node.parent!.from
          const parentEnd = cursor.node.parent!.to
          do {
            expect(cursor.from, text).toBeGreaterThanOrEqual(last)
            last = cursor.to
            check(cursor, parentStart, parentEnd)
          } while (cursor.nextSibling())
          cursor.parent()
        }
      }
      const cursor = tree.cursor()
      if (cursor.firstChild()) {
        do check(cursor, 0, text.length)
        while (cursor.nextSibling())
      }
    }
  })
})
