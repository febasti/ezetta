import { describe, expect, it } from 'vitest'
import {
  nextHeadingStyle,
  commentInputRule,
  continueList,
  indentListItems,
  formatsAt,
  insertComment,
  insertFigure,
  insertFormula,
  insertTable,
  insertFootnote,
  linkAt,
  urlAt,
  mapThrough,
  normalizeUrl,
  paragraphStyleAt,
  removeLink,
  setLink,
  setParagraphStyle,
  toggleInline,
} from './edit'
import type { EditInput, EditResult, ParagraphStyle } from './edit'
import { parseTypst } from './parser'

/** `«…»` marks a selection and `|` a caret in the examples below. */
function parse(source: string): EditInput {
  let doc = source
  let from: number
  let to: number
  const open = doc.indexOf('«')
  if (open >= 0) {
    doc = doc.replace('«', '')
    const close = doc.indexOf('»')
    doc = doc.replace('»', '')
    from = open
    to = close
  } else {
    from = to = doc.indexOf('|')
    doc = doc.replace('|', '')
  }
  return { doc, tree: parseTypst(doc), from, to }
}

function applyChanges(doc: string, result: EditResult): string {
  let out = doc
  for (const change of [...result.changes].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, change.from) + change.insert + out.slice(change.to)
  }
  return out
}

function run(source: string, command: (input: EditInput) => EditResult): string {
  const input = parse(source)
  const result = command(input)
  const doc = applyChanges(input.doc, result)
  // Changes must not overlap and must lie in the original text.
  let last = 0
  for (const c of [...result.changes].sort((a, b) => a.from - b.from)) {
    expect(c.from).toBeGreaterThanOrEqual(last)
    expect(c.to).toBeLessThanOrEqual(input.doc.length)
    last = c.to
  }
  const { anchor, head } = result
  return anchor === head
    ? `${doc.slice(0, anchor)}|${doc.slice(anchor)}`
    : `${doc.slice(0, anchor)}«${doc.slice(anchor, head)}»${doc.slice(head)}`
}

const emph = (s: string): string => run(s, (i) => toggleInline(i, 'emphasis'))
const strong = (s: string): string => run(s, (i) => toggleInline(i, 'strong'))
const hl = (s: string): string => run(s, (i) => toggleInline(i, 'highlight'))
const style = (s: string, st: ParagraphStyle): string => run(s, (i) => setParagraphStyle(i, st))

describe('mapThrough', () => {
  const changes = [
    { from: 2, to: 2, insert: 'ab' },
    { from: 5, to: 7, insert: 'x' },
  ]
  it('shifts positions after changes and honors association at insertions', () => {
    expect(mapThrough(changes, 1)).toBe(1)
    expect(mapThrough(changes, 2, 1)).toBe(4)
    expect(mapThrough(changes, 2, -1)).toBe(2)
    expect(mapThrough(changes, 8)).toBe(9)
    expect(mapThrough(changes, 6, 1)).toBe(8)
    expect(mapThrough(changes, 6, -1)).toBe(7)
  })
})

describe('toggleInline: emphasis and strong', () => {
  it('wraps a selection without the whitespace at its edges', () => {
    expect(emph('Ein «Wort» hier')).toBe('Ein _«Wort»_ hier')
    expect(strong('Ein « Wort » hier')).toBe('Ein  *«Wort»*  hier')
  })

  it('wraps the word at the caret', () => {
    expect(emph('Ein Wo|rt hier')).toBe('Ein _Wo|rt_ hier')
    expect(emph('Ein Wort| hier')).toBe('Ein _Wort|_ hier')
    expect(emph('|Wort')).toBe('_|Wort_')
  })

  it('inserts an empty pair on an empty spot', () => {
    expect(emph('Ein | hier')).toBe('Ein _|_ hier')
  })

  it('removes the markers when toggled again, with the caret or the selection inside', () => {
    expect(emph('Ein _Wo|rt_ hier')).toBe('Ein Wo|rt hier')
    expect(emph('Ein _«Wort»_ hier')).toBe('Ein «Wort» hier')
    expect(emph('Ein «_Wort_» hier')).toBe('Ein «Wort» hier')
  })

  it('removes strong around emphasis without touching the emphasis', () => {
    expect(strong('*a _b|_ c*')).toBe('a _b|_ c')
  })

  it('uses a function inside a word, where a delimiter would not work', () => {
    expect(emph('Wo«r»t')).toBe('Wo#emph[«r»]t')
    expect(strong('Wo«r»t')).toBe('Wo#strong[«r»]t')
    expect(emph('Wo#emph[«r»]t')).toBe('Wo«r»t')
  })

  it('wraps each paragraph of a multi-paragraph selection separately', () => {
    expect(emph('«Eins\n\nZwei»')).toBe('_«Eins_\n\n_Zwei»_')
  })

  it('leaves the result parseable as the same element', () => {
    const out = emph('Ein «Wort» hier').replace(/[«»]/g, '')
    const names: string[] = []
    parseTypst(out).iterate({ enter: (n) => void names.push(n.name) })
    expect(names).toContain('Emphasis')
  })
})

describe('toggleInline: subscript, superscript, small caps', () => {
  const sub = (s: string): string => run(s, (i) => toggleInline(i, 'subscript'))
  const sup = (s: string): string => run(s, (i) => toggleInline(i, 'superscript'))
  const caps = (s: string): string => run(s, (i) => toggleInline(i, 'smallcaps'))

  it('wraps a selection or the word at the caret in the function, never in a delimiter', () => {
    expect(sub('H«2»O')).toBe('H#sub[«2»]O')
    expect(sup('E = mc«2»')).toBe('E = mc#super[«2»]')
    expect(caps('Die «NASA» sagt')).toBe('Die #smallcaps[«NASA»] sagt')
    expect(caps('Die NA|SA sagt')).toBe('Die #smallcaps[NA|SA] sagt')
  })

  it('takes the format off again, from the text and from the caret', () => {
    expect(sub('H#sub[«2»]O')).toBe('H«2»O')
    expect(sup('mc#super[2|]')).toBe('mc2|')
    expect(caps('#smallcaps[NA|SA]')).toBe('NA|SA')
  })

  it('inserts an empty pair on an empty spot, with the caret inside', () => {
    expect(sub('H |')).toBe('H #sub[|]')
    expect(sup('|')).toBe('#super[|]')
  })

  it('subscript and superscript never nest: inside one, another switches it', () => {
    expect(sup('H#sub[«2»]O')).toBe('H#super[«2»]O')
    expect(sub('H#super[2|]O')).toBe('H#sub[2|]O')
    expect(sub('H#sub[2|]O')).toBe('H2|O')
  })

  it('subscript and superscript over a selection take the ones inside off first', () => {
    expect(sup('«a #sub[b] c»')).toBe('#super[«a b c»]')
    expect(sub('«a #sub[b] c»')).toBe('#sub[«a b c»]')
    expect(sup('_«a #sub[b] c»_')).toBe('_#super[«a b c»]_')
    expect(sup('x #sub[a«b] c»')).toBe('x a#super[«b c»]')
    // The syntax itself is never cut into.
    expect(sup('x #su«b[a] c»')).toBe('x #super[«a c»]')
  })

  it('small caps combines with subscript and superscript', () => {
    expect(caps('#super[«2»]')).toBe('#super[#smallcaps[«2»]]')
    expect(caps('#super[ab|]')).toBe('#super[#smallcaps[ab|]]')
    expect(sup('#smallcaps[«2»]')).toBe('#smallcaps[#super[«2»]]')
    expect(sub('#smallcaps[ab|c]')).toBe('#smallcaps[#sub[ab|c]]')
    expect(caps('«a #super[b] c»')).toBe('#smallcaps[«a #super[b] c»]')
  })

  it('a format inside the other kind switches and takes off independently', () => {
    expect(sub('#smallcaps[#super[a|]]')).toBe('#smallcaps[#sub[a|]]')
    expect(caps('#smallcaps[#super[a|]]')).toBe('#super[a|]')
  })

  it('small caps never nests in itself, and a selection holding one takes it off first', () => {
    expect(caps('«a #smallcaps[b] c»')).toBe('#smallcaps[«a b c»]')
  })

  it('cuts a wrapper where the selection crosses a kept element, so the brackets stay balanced', () => {
    expect(caps('#super[a«b] c»')).toBe('#super[a#smallcaps[«b]] #smallcaps[c»]')
    expect(caps('«a #super[b»c]')).toBe('#smallcaps[«a] #super[#smallcaps[b»]c]')
  })

  it('works inside emphasis, and reports the format for the toolbar', () => {
    expect(sup('_ein «2» Text_')).toBe('_ein #super[«2»] Text_')
    const at = formatsAt(parse('#super[a|b] #sub[c] #smallcaps[d]'))
    expect(at).toMatchObject({ superscript: true, subscript: false, smallcaps: false })
  })
})

describe('toggleInline: highlight', () => {
  it('wraps and unwraps with ::', () => {
    expect(hl('Die «Probe» war')).toBe('Die ::«Probe»:: war')
    expect(hl('Die ::«Probe»:: war')).toBe('Die «Probe» war')
    expect(hl('Die ::Pro|be:: war')).toBe('Die Pro|be war')
  })

  it('is not affected by letters next to it', () => {
    expect(hl('Wo«r»t')).toBe('Wo::«r»::t')
  })
})

describe('setParagraphStyle', () => {
  it('turns a line into headings of each level, replacing an existing level', () => {
    expect(style('Ein Satz|', { kind: 'heading', level: 1 })).toBe('= Ein Satz|')
    expect(style('Ein Satz|', { kind: 'heading', level: 3 })).toBe('=== Ein Satz|')
    expect(style('= Ein Satz|', { kind: 'heading', level: 2 })).toBe('== Ein Satz|')
    expect(style('== Ein| Satz', { kind: 'text' })).toBe('Ein| Satz')
  })

  it('choosing the current style again returns to plain text', () => {
    expect(style('= Ein Satz|', { kind: 'heading', level: 1 })).toBe('Ein Satz|')
    expect(style('- Punkt|', { kind: 'bullet' })).toBe('Punkt|')
  })

  it('makes bullet and numbered lists, line by line, and converts between them', () => {
    expect(style('«eins\nzwei»', { kind: 'bullet' })).toBe('«- eins\n- zwei»')
    expect(style('«- eins\n- zwei»', { kind: 'numbered' })).toBe('«+ eins\n+ zwei»')
    expect(style('= Titel|', { kind: 'bullet' })).toBe('- Titel|')
  })

  it('keeps indentation of list items and skips blank lines in a multi-line selection', () => {
    expect(style('«- a\n  - b\n\n- c»', { kind: 'numbered' })).toBe('«+ a\n  + b\n\n+ c»')
    expect(style('«eins\n\nzwei»', { kind: 'bullet' })).toBe('«- eins\n\n- zwei»')
  })

  it('lets a caret on an empty line start a list or heading', () => {
    expect(style('Text\n|', { kind: 'bullet' })).toBe('Text\n- |')
    expect(style('|', { kind: 'heading', level: 1 })).toBe('= |')
  })

  it('wraps lines in a block quote and unwraps them again', () => {
    expect(style('Ein Zitat|', { kind: 'quote' })).toBe('#quote(block: true)[Ein Zitat|]')
    expect(style('«Eins\nZwei»', { kind: 'quote' })).toBe('#quote(block: true)[«Eins\nZwei»]')
    expect(style('#quote(block: true)[Ein Zi|tat]', { kind: 'quote' })).toBe('Ein Zi|tat')
    expect(style('#quote(block: true)[Ein Zi|tat]', { kind: 'text' })).toBe('Ein Zi|tat')
    expect(style('#quote(block: true)[\n  Text|\n]', { kind: 'quote' })).toBe('  Text|')
  })

  it('makes an epigraph of lines, tells it from a block quote by its label, and converts between them', () => {
    expect(style('Ein Motto|', { kind: 'epigraph' })).toBe(
      '#quote(block: true)[Ein Motto|] <epigraph>',
    )
    // Choosing the other of the two changes the label; choosing the same one takes the quote off.
    expect(style('#quote(block: true)[Zi|tat]', { kind: 'epigraph' })).toBe(
      '#quote(block: true)[Zi|tat] <epigraph>',
    )
    expect(style('#quote(block: true)[Zi|tat] <epigraph>', { kind: 'quote' })).toBe(
      '#quote(block: true)[Zi|tat]',
    )
    expect(style('#quote(block: true)[Zi|tat] <epigraph>', { kind: 'epigraph' })).toBe('Zi|tat')
    // Plain text takes the label with it, and the source (the attribution) goes with the wrapper.
    expect(
      style('#quote(block: true, attribution: [Goethe])[Zi|tat] <epigraph>', { kind: 'text' }),
    ).toBe('Zi|tat')
  })

  it('does not select the following line when the selection ends at a line start', () => {
    expect(style('«eins\n»zwei', { kind: 'bullet' })).toBe('«- eins\n»zwei')
  })

  it('reports the style at a position', () => {
    const at = (src: string): ParagraphStyle => {
      const i = parse(src)
      return paragraphStyleAt(i.tree, i.doc, i.from)
    }
    expect(at('Ein Satz|')).toEqual({ kind: 'text' })
    expect(at('== Titel|')).toEqual({ kind: 'heading', level: 2 })
    expect(at('= Ti|tel')).toEqual({ kind: 'heading', level: 1 })
    expect(at('|= Titel')).toEqual({ kind: 'heading', level: 1 })
    expect(at('- Pu|nkt')).toEqual({ kind: 'bullet' })
    expect(at('+ Pu|nkt')).toEqual({ kind: 'numbered' })
    expect(at('- erste\n  zwei|te Zeile')).toEqual({ kind: 'bullet' })
    expect(at('#quote(block: true)[Zi|tat]')).toEqual({ kind: 'quote' })
    expect(at('#quote(block: true)[Mo|tto] <epigraph>')).toEqual({ kind: 'epigraph' })
    expect(at('#quote(block: true)[Zi|tat] <andere>')).toEqual({ kind: 'quote' })
    expect(at('#quote[kein Block|]')).toEqual({ kind: 'text' })
    expect(at('Text\n\n= A\n\nnoch Tex|t')).toEqual({ kind: 'text' })
  })
})

describe('lists', () => {
  const enter = (s: string): string => run(s, (i) => continueList(i)!)
  const tab = (s: string): string => run(s, (i) => indentListItems(i, 1)!)
  const shiftTab = (s: string): string => run(s, (i) => indentListItems(i, -1)!)

  it('Enter starts the next item at the same level and moves the text after the caret along', () => {
    expect(enter('- eins|')).toBe('- eins\n- |')
    expect(enter('+ eins|')).toBe('+ eins\n+ |')
    expect(enter('- eins\n  - zwei|')).toBe('- eins\n  - zwei\n  - |')
    expect(enter('- ein|s')).toBe('- ein\n- |s')
  })

  it('Enter in an empty item moves it out one level, and out of the list at the top level', () => {
    expect(enter('- eins\n  - |')).toBe('- eins\n- |')
    expect(enter('- eins\n    - |')).toBe('- eins\n  - |')
    expect(enter('- eins\n- |')).toBe('- eins\n|')
  })

  it('Enter is left to the editor outside list text', () => {
    expect(continueList(parse('Ein Satz|'))).toBeNull()
    expect(continueList(parse('-| eins'))).toBeNull()
    expect(continueList(parse('«- eins»'))).toBeNull()
    expect(continueList(parse('#raw("\n- eins|")'))).toBeNull()
  })

  it('Tab nests an item under the item above, one level at most', () => {
    expect(tab('- eins\n- zwei|')).toBe('- eins\n  - zwei|')
    expect(tab('- eins\n  - zwei|')).toBe('- eins\n  - zwei|')
    expect(tab('- eins\n  - zwei\n- drei|')).toBe('- eins\n  - zwei\n  - drei|')
    expect(tab('- eins\n  Fortsetzung\n- zwei|')).toBe('- eins\n  Fortsetzung\n  - zwei|')
  })

  it('Tab does nothing for the first item, but still counts as handled', () => {
    expect(tab('- eins|')).toBe('- eins|')
    expect(tab('Text\n\n- eins|')).toBe('Text\n\n- eins|')
    expect(indentListItems(parse('Ein Satz|'), 1)).toBeNull()
  })

  it('Tab and Shift-Tab move all selected items', () => {
    expect(tab('- eins\n«- zwei\n- drei»')).toBe('- eins\n  «- zwei\n  - drei»')
    expect(shiftTab('- eins\n«  - zwei\n  - drei»')).toBe('- eins\n«- zwei\n- drei»')
  })

  it('Shift-Tab moves an item out one level and stops at the top level', () => {
    expect(shiftTab('- eins\n    - zwei|')).toBe('- eins\n  - zwei|')
    expect(shiftTab('- eins|')).toBe('- eins|')
  })
})

describe('links', () => {
  const link = (s: string, url: string): string => run(s, (i) => setLink(i, url))

  it('turns the selection into a link with the selection as its text', () => {
    expect(link('Siehe «hier» bitte', 'https://example.org')).toBe(
      'Siehe #link("https://example.org")[«hier»] bitte',
    )
  })

  it('uses the URL as text when nothing is selected', () => {
    expect(link('Siehe | bitte', 'https://example.org')).toBe(
      'Siehe #link("https://example.org")[«https://example.org»] bitte',
    )
  })

  it('escapes quotes and backslashes in the URL', () => {
    expect(link('«x»', 'https://a.example/"q"\\')).toContain(
      '#link("https://a.example/\\"q\\"\\\\")',
    )
  })

  it('does not put unbalanced brackets into the text', () => {
    expect(link('«a ] b»', 'https://x.example')).toContain('[«https://x.example»]')
  })

  it('takes the link off and keeps its words, and leaves text without a link alone', () => {
    expect(run('Siehe #link("https://alt.example")[di|ese Seite] bitte', removeLink)).toBe(
      'Siehe di|ese Seite bitte',
    )
    expect(run('Siehe #link("https://alt.example")[«diese Seite»].', removeLink)).toBe(
      'Siehe «diese Seite».',
    )
    expect(run('Kein Li|nk hier.', removeLink)).toBe('Kein Li|nk hier.')
  })

  it('changes the URL of the link the caret is in, and finds it', () => {
    expect(link('#link("https://alt.example")[Te|xt]', 'https://neu.example')).toBe(
      '#link("https://neu.example")[Te|xt]',
    )
    const input = parse('#link("https://alt.example")[Te|xt]')
    expect(linkAt(input)?.url).toBe('https://alt.example')
    expect(linkAt(parse('Kein| Link'))).toBeNull()
  })
})

describe('formatsAt', () => {
  const none = { subscript: false, superscript: false, smallcaps: false }
  it('reports the inline formats around the caret or selection', () => {
    expect(formatsAt(parse('Ein _Wo|rt_ hier'))).toEqual({
      emphasis: true,
      strong: false,
      highlight: false,
      ...none,
    })
    expect(formatsAt(parse('*a _b|_ c*'))).toEqual({
      emphasis: true,
      strong: true,
      highlight: false,
      ...none,
    })
    expect(formatsAt(parse('::«Probe»::'))).toEqual({
      emphasis: false,
      strong: false,
      highlight: true,
      ...none,
    })
    expect(formatsAt(parse('Kein| Format'))).toEqual({
      emphasis: false,
      strong: false,
      highlight: false,
      ...none,
    })
    expect(formatsAt(parse('Wo#strong[r|t]'))).toEqual({
      emphasis: false,
      strong: true,
      highlight: false,
      ...none,
    })
  })
})

describe('normalizeUrl', () => {
  it('completes bare domains and e-mail addresses and rejects empty or spaced input', () => {
    expect(normalizeUrl(' example.org/a ')).toBe('https://example.org/a')
    expect(normalizeUrl('https://example.org')).toBe('https://example.org')
    expect(normalizeUrl('mailto:a@b.example')).toBe('mailto:a@b.example')
    expect(normalizeUrl('a@b.example')).toBe('mailto:a@b.example')
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('https://')).toBeNull()
    expect(normalizeUrl('zwei wörter')).toBeNull()
  })
})

describe('urlAt', () => {
  it('finds bare URLs and link targets, and nothing elsewhere', () => {
    expect(urlAt(parse('Siehe https://exa|mple.org/a hier'))).toBe('https://example.org/a')
    expect(urlAt(parse('#link("https://x.example")[Te|xt]'))).toBe('https://x.example')
    expect(urlAt(parse('Kein| Link'))).toBeNull()
  })
})

describe('insertComment', () => {
  const comment = (s: string): string => run(s, insertComment)

  it('inserts an empty comment at the caret', () => {
    expect(comment('Text | mehr')).toBe('Text /* | */ mehr'.replace('/* | */', '/* | */'))
  })

  it('highlights the selection and puts the comment right after it', () => {
    expect(comment('Die «Probe» war')).toBe('Die ::Probe:: /* | */ war')
  })

  it('adds the comment after an existing highlight', () => {
    expect(comment('Die ::Pro|be:: war')).toBe('Die ::Probe:: /* | */ war')
  })

  it('reuses a comment that already follows the highlight', () => {
    expect(comment('Die ::Pro|be:: /* alt */ war')).toBe('Die ::Probe:: /* |alt */ war')
    expect(comment('Die «Probe» /* alt */ war')).toBe('Die ::Probe:: /* |alt */ war')
  })

  it('does nothing inside a comment', () => {
    expect(comment('a /* x| */ b')).toBe('a /* x| */ b')
  })

  it('wraps each paragraph of a multi-paragraph selection', () => {
    expect(comment('«Eins\n\nZwei»')).toBe('::Eins::\n\n::Zwei:: /* | */')
  })
})

describe('insertFootnote', () => {
  const note = (s: string): string => run(s, insertFootnote)

  it('inserts an empty note after the caret, with the caret inside', () => {
    expect(note('Ein Satz.| Weiter.')).toBe('Ein Satz.#footnote[|] Weiter.')
  })

  it('inserts after the end of a selection and leaves the selected text alone', () => {
    expect(note('Ein «Satz». Weiter.')).toBe('Ein Satz#footnote[|]. Weiter.')
  })

  it('inserts next to an existing note when the caret is at its edge', () => {
    expect(note('A#footnote[x]| B')).toBe('A#footnote[x]#footnote[|] B')
    expect(note('A|#footnote[x] B')).toBe('A#footnote[|]#footnote[x] B')
  })

  it('does nothing inside a note, raw text, math, or a comment', () => {
    expect(note('A#footnote[ab|c] B')).toBe('A#footnote[ab|c] B')
    expect(note('A `co|de` B')).toBe('A `co|de` B')
    expect(note('A $x|^2$ B')).toBe('A $x|^2$ B')
    expect(note('A /* x| */ B')).toBe('A /* x| */ B')
  })

  it('produces a note the parser finds', () => {
    const out = note('Ein Satz.|').replace('|', '')
    const names: string[] = []
    parseTypst(out).iterate({ enter: (n) => void names.push(n.name) })
    expect(names).toContain('Content')
    expect(out).toBe('Ein Satz.#footnote[]')
  })
})

describe('insertTable', () => {
  it('puts an empty table with a header row in a paragraph of its own', () => {
    const input = parse('Erster Absatz.\n\nZweiter.|')
    const out = applyChanges(
      input.doc,
      insertTable(input, { rows: 3, columns: 2, random: () => 0 }),
    )
    expect(out).toContain('Zweiter.\n\n#figure(\n  table(\n    columns: 2,\n    table.header[][],')
    // The table's id is made when it is placed: a random one, and no word of its caption.
    expect(out).toMatch(/\) <tbl-aaaaaa>$/)
  })

  it('gives each new table its own id, limits the size, and does nothing in code or math', () => {
    const first = parse('A|')
    const doc = applyChanges(first.doc, insertTable(first, { rows: 2, columns: 2 }))
    expect(doc).toMatch(/\) <tbl-[a-z0-9]{6}>$/)
    const second = parse(`${doc}|`)
    const both = applyChanges(second.doc, insertTable(second, { rows: 2, columns: 2 }))
    const labels = [...both.matchAll(/<(tbl-[a-z0-9]{6})>/g)].map((m) => m[1])
    expect(labels).toHaveLength(2)
    expect(new Set(labels).size).toBe(2)
    const huge = applyChanges(first.doc, insertTable(first, { rows: 999, columns: 999 }))
    const header = huge.split('table.header')[1]!.split('\n')[0]!
    expect(header.split('[').length - 1).toBe(30)
    const code = parse('`co|de`')
    expect(insertTable(code, { rows: 2, columns: 2 }).changes).toEqual([])
  })
})

describe('insertFigure', () => {
  // A fixed random source makes the id known: 0 gives "aaaaaa".
  const figure = (s: string, kind: 'figure' | 'inline' = 'figure', path = 'assets/a.png'): string =>
    run(s, (i) => insertFigure(i, { kind, path, random: () => 0 }))
  const FIG = '#figure(\n  image("assets/a.png", width: 75%),\n  caption: [],\n) <fig-aaaaaa>'

  it('puts a figure after the paragraph, with a blank line on both sides', () => {
    expect(figure('Ein Absatz| hier.\n\nNächster.')).toBe(
      `Ein Absatz hier.\n\n${FIG}|\n\nNächster.`,
    )
    expect(figure('Eins\nzwei| drei\nvier\n\nNächster.')).toBe(
      `Eins\nzwei drei\nvier\n\n${FIG}|\n\nNächster.`,
    )
  })

  it('works at the end of the text, with and without a final line break', () => {
    expect(figure('Ende.|')).toBe(`Ende.\n\n${FIG}|`)
    expect(figure('Ende.|\n')).toBe(`Ende.\n\n${FIG}|\n`)
  })

  it('uses an empty line as it is, adding a blank line only when text follows right away', () => {
    expect(figure('A.\n\n|\n\nB.')).toBe(`A.\n\n${FIG}|\n\nB.`)
    expect(figure('A.\n\n|\nB.')).toBe(`A.\n\n${FIG}|\n\nB.`)
    expect(figure('|')).toBe(`${FIG}|`)
  })

  it('inserts a placeholder without an image when no path is given, with its own id', () => {
    expect(figure('Ende.|', 'figure', '')).toBe(
      'Ende.\n\n#figure(\n  rect(width: 100%, height: 6cm),\n  caption: [],\n) <fig-aaaaaa>|',
    )
  })

  it('gives the figure an id that does not depend on the file', () => {
    expect(figure('|', 'figure', 'assets/ganz-anders.png')).toContain('<fig-aaaaaa>')
  })

  it('inserts an inline image at the end of the selection', () => {
    expect(figure('Ein Wort| hier', 'inline')).toBe(
      'Ein Wort#box(image("assets/a.png", height: 1em))| hier',
    )
    expect(figure('Ein «Wort» hier', 'inline')).toBe(
      'Ein Wort#box(image("assets/a.png", height: 1em))| hier',
    )
  })

  it('does nothing inside code, math, raw text, or comments', () => {
    expect(figure('A `co|de` B')).toBe('A `co|de` B')
    expect(figure('A /* x| */ B')).toBe('A /* x| */ B')
  })

  it('writes something the scanner reads back, with an id that is not yet used', () => {
    // The first draw ("aaaaaa") is taken, so the generator draws again.
    const draws = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let n = 0
    const out = run('<fig-aaaaaa> Ende.|', (i) =>
      insertFigure(i, { kind: 'figure', path: '', random: () => draws[n++]! }),
    )
    expect(out).toContain('<fig-ssssss>')
    expect(out.match(/<fig-aaaaaa>/g)).toHaveLength(1)
  })
})

describe('insertFormula', () => {
  const formula = (s: string, display: boolean): string =>
    run(s, (i) => insertFormula(i, { display, random: () => 0 }))

  it('gives a block formula its id at once, and an inline formula none (it cannot be referred to)', () => {
    expect(formula('Text|', true)).toBe('Text\n\n$ x $ <eq-aaaaaa>|')
    expect(formula('Text|', false)).toBe('Text$x$|')
    expect(formula('Wort| hier', false)).not.toContain('<eq-')
  })

  it('uses an id that is not taken', () => {
    const draws = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let n = 0
    const out = run('$ y $ <eq-aaaaaa>\n\n|', (i) =>
      insertFormula(i, { display: true, random: () => draws[n++]! }),
    )
    expect(out).toContain('<eq-ssssss>')
  })
})

describe('commentInputRule', () => {
  const rule = (before: string, typed = '='): string | null => {
    const change = commentInputRule(before, before.length, typed)
    return change ? before.slice(0, change.from) + change.insert : null
  }

  it('turns ==text= plus the typed = into a comment', () => {
    expect(rule('Text ==Auswahlkriterien erklären=')).toBe('Text /* Auswahlkriterien erklären */')
    expect(rule('==a=')).toBe('/* a */')
  })

  it('does not apply to other characters, spaces at the edges, headings, or longer runs', () => {
    expect(rule('==text=', 'x')).toBeNull()
    expect(rule('== text=')).toBeNull()
    expect(rule('==text =')).toBeNull()
    expect(rule('===text=')).toBeNull()
    expect(rule('a == b = c =')).toBeNull()
  })

  it('does not apply inside raw text, math, or comments', () => {
    const doc = 'Ein `==a=`'
    expect(commentInputRule(doc.slice(0, -1), doc.length - 1, '=', parseTypst(doc))).toBeNull()
    const math = '$==a=$'
    expect(commentInputRule('$==a=', 5, '=', parseTypst(math))).toBeNull()
  })

  it('only looks at the current line', () => {
    expect(rule('==a\nb=')).toBeNull()
  })
})

describe('nextHeadingStyle', () => {
  it('goes from a paragraph through heading 1 to 4 and back to a paragraph', () => {
    const seen: ParagraphStyle[] = []
    let style: ParagraphStyle = { kind: 'text' }
    for (let i = 0; i < 5; i++) {
      style = nextHeadingStyle(style)
      seen.push(style)
    }
    expect(seen).toEqual([
      { kind: 'heading', level: 1 },
      { kind: 'heading', level: 2 },
      { kind: 'heading', level: 3 },
      { kind: 'heading', level: 4 },
      { kind: 'text' },
    ])
  })

  it('starts a list item or a quote at heading 1, and takes a deeper heading back to a paragraph', () => {
    for (const kind of ['bullet', 'numbered', 'quote'] as const)
      expect(nextHeadingStyle({ kind })).toEqual({ kind: 'heading', level: 1 })
    expect(nextHeadingStyle({ kind: 'heading', level: 6 })).toEqual({ kind: 'text' })
  })
})
