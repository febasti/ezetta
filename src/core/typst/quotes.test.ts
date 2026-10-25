import { describe, expect, it } from 'vitest'
import type { EditResult } from './edit'
import { scanCitations } from './citations'
import { parseTypst } from './parser'
import {
  addSourceCitations,
  blockQuoteWords,
  inlineQuoteAt,
  leaveBlockQuote,
  QUOTE_STYLES,
  quoteMarks,
  quoteStyleSetRule,
  quoteToBlock,
  quoteToInline,
  removeQuote,
  scanQuotes,
  setAttribution,
  toggleEpigraph,
  toggleInlineQuote,
  unwrapInline,
  quoteInputRule,
} from './quotes'

const scan = (doc: string) => scanQuotes(parseTypst(doc), doc)
const applyAll = (doc: string, edits: { from: number; to: number; insert: string }[]): string =>
  [...edits]
    .sort((a, b) => b.from - a.from)
    .reduce((text, e) => text.slice(0, e.from) + e.insert + text.slice(e.to), doc)

/** `|` marks the caret, `«…»` a selection. */
function toggle(source: string): { out: string; caret: [number, number] } {
  let doc = source
  let from: number
  let to: number
  if (doc.includes('«')) {
    from = doc.indexOf('«')
    doc = doc.replace('«', '')
    to = doc.indexOf('»')
    doc = doc.replace('»', '')
  } else {
    from = to = doc.indexOf('|')
    doc = doc.replace('|', '')
  }
  const result: EditResult = toggleInlineQuote({ doc, tree: parseTypst(doc), from, to })
  return { out: applyAll(doc, result.changes), caret: [result.anchor, result.head] }
}

describe('scanQuotes', () => {
  it('tells inline quotes from block quotes and counts the words of an inline quote', () => {
    const doc = 'Er sagte #quote[Eins zwei drei] dort.\n\n#quote(block: true)[Ein Block.]'
    const [inline, block] = scan(doc)
    expect(inline).toMatchObject({ block: false, words: 3, depth: 0, args: null })
    expect(doc.slice(inline!.from, inline!.openTo)).toBe('#quote[')
    expect(doc.slice(inline!.closeFrom, inline!.to)).toBe(']')
    expect(block).toMatchObject({ block: true })
    expect(doc.slice(block!.from, block!.openTo)).toBe('#quote(block: true)[')
  })

  it('numbers the nesting of inline quotes', () => {
    const quotes = scan('#quote[außen #quote[innen] wieder #quote[auch innen]]')
    expect(quotes.map((q) => q.depth)).toEqual([0, 1, 1])
  })

  it('counts a block quote as a level only when block quotes have marks, as Typst does', () => {
    const doc = '#quote(block: true)[Er sagte #quote[innen] dort.]'
    const without = scanQuotes(parseTypst(doc), doc)
    const withMarks = scanQuotes(parseTypst(doc), doc, { blockMarks: true })
    expect(without.find((q) => !q.block)!.depth).toBe(0)
    expect(withMarks.find((q) => !q.block)!.depth).toBe(1)
  })

  it('keeps arguments such as an attribution, and leaves quotes in notes alone', () => {
    const doc = '#quote(attribution: [Kant])[Sapere aude] #footnote[Siehe #quote[das].]'
    const quotes = scan(doc)
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.args).not.toBeNull()
  })

  it('finds the innermost inline quote around a position', () => {
    const doc = '#quote[a #quote[b] c]'
    const quotes = scan(doc)
    expect(inlineQuoteAt(quotes, doc.indexOf('b'))?.depth).toBe(1)
    expect(inlineQuoteAt(quotes, doc.indexOf('c'))?.depth).toBe(0)
    expect(inlineQuoteAt(quotes, doc.length + 5)).toBeNull()
  })
})

describe('quote marks and thresholds', () => {
  it('gives the marks of the language, outer then inner', () => {
    expect(quoteMarks('de')).toEqual({ open: ['„', '‚'], close: ['“', '‘'] })
    expect(quoteMarks('en').open[0]).toBe('“')
  })

  it('has a pair of marks for every kind, outer and inner, and a set rule for each but auto', () => {
    for (const style of QUOTE_STYLES) {
      const marks = quoteMarks('de', style)
      expect(marks.open.every((mark) => mark.length > 0)).toBe(true)
      expect(marks.close.every((mark) => mark.length > 0)).toBe(true)
      expect(quoteStyleSetRule(style) === null).toBe(style === 'auto')
    }
    expect(quoteMarks('de', 'ja').open).toEqual(['「', '『'])
    expect(quoteMarks('de', 'sv').open[0]).toBe(quoteMarks('de', 'sv').close[0])
  })

  it('lets a chosen style win over the language', () => {
    expect(quoteMarks('de', 'de-guillemets')).toEqual({ open: ['»', '›'], close: ['«', '‹'] })
    expect(quoteMarks('en', 'ch').open).toEqual(['«', '‹'])
    expect(quoteMarks('de', 'auto')).toEqual(quoteMarks('de'))
  })

  it('takes the threshold from the citation style', () => {
    expect(blockQuoteWords('apa-7')).toBe(40)
    expect(blockQuoteWords('chicago-author-date')).toBe(100)
    expect(blockQuoteWords('mla')).toBe(50)
    expect(blockQuoteWords('whatever')).toBe(40)
  })
})

describe('toggleInlineQuote', () => {
  it('wraps a selection in one paragraph', () => {
    const { out, caret } = toggle('Er sagte «Hallo Welt» laut.')
    expect(out).toBe('Er sagte #quote[Hallo Welt] laut.')
    expect(caret).toEqual([out.indexOf(' laut'), out.indexOf(' laut')])
  })

  it('keeps spaces at the ends of the selection outside the quote', () => {
    expect(toggle('Er sagte« Hallo Welt »laut.').out).toBe('Er sagte #quote[Hallo Welt] laut.')
  })

  it('inserts an empty quote at a caret, with the caret inside', () => {
    const { out, caret } = toggle('Er sagte | laut.')
    expect(out).toBe('Er sagte #quote[] laut.')
    expect(caret[0]).toBe(out.indexOf(']'))
  })

  it('takes an existing quote off and keeps its text', () => {
    const { out, caret } = toggle('Er sagte #quote[Hallo| Welt] laut.')
    expect(out).toBe('Er sagte Hallo Welt laut.')
    expect(caret[0]).toBe('Er sagte Hallo'.length)
  })

  it('takes a quote off when all of its text is selected', () => {
    expect(toggle('Er #quote[«Hallo»] laut.').out).toBe('Er Hallo laut.')
  })

  it('takes it off from a selection around the quote as well', () => {
    expect(toggle('Er «#quote[Hallo]» laut.').out).toBe('Er Hallo laut.')
  })

  it('puts a quote inside a quote when only part of its text is selected', () => {
    expect(toggle('#quote[außen «innen» wieder]').out).toBe('#quote[außen #quote[innen] wieder]')
  })

  it('does nothing over a blank line, in code, raw text, math, or comments', () => {
    for (const source of [
      'Eins «zwei\n\ndrei» vier',
      '`co|de`',
      '$x| y$',
      '/* no| te */',
      '#f(a «b» c)',
    ])
      expect(toggle(source).out).toBe(source.replace(/[|«»]/g, ''))
  })

  it('does nothing where the selection would cut a footnote in two', () => {
    const source = 'Text «mehr#footnote[Eine» Notiz] danach'
    expect(toggle(source).out).toBe(source.replace(/[«»]/g, ''))
  })

  it('can be undone by the same command', () => {
    const wrapped = toggle('a «b» c').out
    const again = toggle(wrapped.replace('#quote[b', '#quote[|b'))
    expect(again.out).toBe('a b c')
  })
})

describe('quoteToBlock', () => {
  const convert = (doc: string): string | null => {
    const result = quoteToBlock(doc, scan(doc)[0]!, scanCitations(parseTypst(doc), doc))
    return result ? applyAll(doc, [result.edit]) : null
  }

  it('splits the paragraph around the quote', () => {
    expect(convert('Davor steht #quote[ein langes Zitat] und danach geht es weiter.')).toBe(
      'Davor steht\n\n#quote(block: true)[ein langes Zitat]\n\nund danach geht es weiter.',
    )
  })

  it('does not add blank lines where the quote starts or ends the paragraph', () => {
    expect(convert('#quote[Zitat] und Text.')).toBe('#quote(block: true)[Zitat]\n\nund Text.')
    expect(convert('Text: #quote[Zitat]')).toBe('Text:\n\n#quote(block: true)[Zitat]')
    expect(convert('Davor.\n\n#quote[Nur Zitat]\n\nDanach.')).toBe(
      'Davor.\n\n#quote(block: true)[Nur Zitat]\n\nDanach.',
    )
  })

  it('keeps an attribution', () => {
    expect(convert('Text #quote(attribution: [Kant])[Sapere].')).toBe(
      'Text\n\n#quote(block: true, attribution: [Kant])[Sapere]\n\n.',
    )
  })

  it('moves the citation right behind the quote into its attribution, as its source', () => {
    const doc = 'Kant schreibt #quote[Sapere aude] @kant1781[S. 12] und meint Mut.'
    const result = quoteToBlock(doc, scan(doc)[0]!, scanCitations(parseTypst(doc), doc))!
    expect(applyAll(doc, [result.edit])).toBe(
      'Kant schreibt\n\n#quote(block: true, attribution: [@kant1781[S. 12]])[Sapere aude]\n\nund meint Mut.',
    )
    // A run of citations moves together, with a check comment, and the full stop after it goes.
    const run = 'A #quote[b] @k1 @k2[S. 3]/*#check*/.\n\nWeiter.'
    const converted = quoteToBlock(run, scan(run)[0]!, scanCitations(parseTypst(run), run))!
    expect(applyAll(run, [converted.edit])).toBe(
      'A\n\n#quote(block: true, attribution: [@k1 @k2[S. 3]/*#check*/])[b]\n\nWeiter.',
    )
  })

  it('leaves a citation that is not right behind the quote where it is', () => {
    const doc = 'Er sagt #quote[Text] und zitiert @k1 später.'
    const result = quoteToBlock(doc, scan(doc)[0]!, scanCitations(parseTypst(doc), doc))!
    expect(applyAll(doc, [result.edit])).toBe(
      'Er sagt\n\n#quote(block: true)[Text]\n\nund zitiert @k1 später.',
    )
  })

  it('refuses a quote in a list item or a heading', () => {
    expect(convert('- Punkt mit #quote[Zitat] darin')).toBeNull()
    expect(convert('= Titel mit #quote[Zitat]')).toBeNull()
  })

  it('puts the caret at the end of the quoted text', () => {
    const doc = 'A #quote[b c] d'
    const { edit, caret } = quoteToBlock(doc, scan(doc)[0]!)!
    const out = applyAll(doc, [edit])
    expect(out.slice(0, caret)).toBe('A\n\n#quote(block: true)[b c')
  })

  it('gives a block that is read back as a block quote', () => {
    const out = convert('A #quote[b c] d')!
    expect(scan(out).map((q) => q.block)).toEqual([true])
  })
})

describe('quoteToInline', () => {
  const convert = (doc: string): string | null => {
    const edits = quoteToInline(doc, scan(doc)[0]!, scanCitations(parseTypst(doc), doc))
    return edits ? applyAll(doc, edits) : null
  }

  it('drops the block argument and the parentheses with it', () => {
    expect(convert('#quote(block: true)[Ein Zitat.]')).toBe('#quote[Ein Zitat.]')
  })

  it('keeps arguments it has no use for', () => {
    expect(convert('#quote(block: true, quotes: false)[Sapere]')).toBe(
      '#quote(quotes: false)[Sapere]',
    )
    expect(convert('#quote(quotes: false, block: true)[Sapere]')).toBe(
      '#quote(quotes: false)[Sapere]',
    )
  })

  it('refuses an attribution of free text, which an inline quote would not print', () => {
    expect(convert('#quote(block: true, attribution: [Kant])[Sapere]')).toBeNull()
  })

  it('refuses an epigraph: it is not part of the text', () => {
    expect(convert('#quote(block: true)[Motto] <epigraph>')).toBeNull()
  })

  it('moves the citations of its attribution behind the closing mark', () => {
    const doc = 'Text #quote(block: true, attribution: [@k1[S. 2] @k2])[Sapere] Ende.'
    const edits = quoteToInline(doc, scan(doc)[0]!, scanCitations(parseTypst(doc), doc))!
    expect(applyAll(doc, edits)).toBe('Text #quote[Sapere] @k1[S. 2] @k2 Ende.')
  })

  it('refuses several paragraphs, which an inline quote cannot hold', () => {
    expect(convert('#quote(block: true)[Eins\n\nZwei]')).toBeNull()
  })

  it('refuses an inline quote', () => {
    expect(convert('#quote[Schon inline]')).toBeNull()
  })
})

describe('unwrapInline', () => {
  it('lists the two pieces to cut', () => {
    const doc = 'a #quote[b] c'
    expect(applyAll(doc, unwrapInline(scan(doc)[0]!))).toBe('a b c')
  })
})

describe('quoteInputRule', () => {
  /** What typing `typed` after `before` makes of the text, or null when nothing is converted. */
  const typeAfter = (before: string, typed: string): string | null => {
    const change = quoteInputRule(before, before.length, typed, parseTypst(before))
    return change ? before.slice(0, change.from) + change.insert : null
  }

  it('turns a pair of straight marks into a quote when the closing one is typed', () => {
    expect(typeAfter('Er sagte "Das ist wahr', '"')).toBe('Er sagte #quote[Das ist wahr]')
    expect(typeAfter('"Anfang', '"')).toBe('#quote[Anfang]')
    expect(typeAfter('Er (und "sie', '"')).toBe('Er (und #quote[sie]')
  })

  it('knows the marks of both languages and of French', () => {
    expect(typeAfter('Er sagte „Das ist wahr', '“')).toBe('Er sagte #quote[Das ist wahr]')
    expect(typeAfter('Er sagte „Das ist wahr', '”')).toBe('Er sagte #quote[Das ist wahr]')
    expect(typeAfter('He said “That is true', '”')).toBe('He said #quote[That is true]')
    expect(typeAfter('Er sagte „Das ist wahr', '"')).toBe('Er sagte #quote[Das ist wahr]')
    expect(typeAfter('Er sagte »Das ist wahr', '«')).toBe('Er sagte #quote[Das ist wahr]')
    expect(typeAfter('Il dit «Voilà', '»')).toBe('Il dit #quote[Voilà]')
  })

  it('keeps the markup inside, and makes a quote inside a quote of the inner pair', () => {
    expect(typeAfter('Er sagte "das _ist_ wahr', '"')).toBe('Er sagte #quote[das _ist_ wahr]')
    expect(typeAfter('"Er sagte „innen', '“')).toBe('"Er sagte #quote[innen]')
  })

  it('does nothing for other characters, and for marks that do not pair up', () => {
    expect(typeAfter('Er sagte "Das ist wahr', '.')).toBeNull()
    expect(typeAfter('Er sagte "Das ist wahr', "'")).toBeNull()
    // The closing mark of another language's pair, or an opening one: not a closing mark here.
    expect(typeAfter('Er sagte „Das ist wahr', '«')).toBeNull()
    expect(typeAfter('Er sagte »Das ist wahr', '»')).toBeNull()
    // A single mark with nothing before it, an inch sign, a mark after a space.
    expect(typeAfter('Er sagte Das ist wahr', '"')).toBeNull()
    // The inch sign is not an opening mark; a proper pair after it still is a quote.
    expect(typeAfter('Der Bildschirm hat 5" und 6', '"')).toBeNull()
    expect(typeAfter('Der Bildschirm hat 5" und "zwei', '"')).toBe(
      'Der Bildschirm hat 5" und #quote[zwei]',
    )
    expect(typeAfter('Er sagte "Das ist wahr ', '"')).toBeNull()
    expect(typeAfter('Er sagte " Das ist wahr', '"')).toBeNull()
    expect(typeAfter('"', '"')).toBeNull()
    expect(typeAfter('Er sagte ""', '"')).toBeNull()
  })

  it('does not reach back over another mark, or over a line', () => {
    expect(typeAfter('"eins" und zwei', '"')).toBeNull()
    expect(typeAfter('Er sagte "Das\nist wahr', '"')).toBeNull()
  })

  it('leaves code, math, raw text, comments, and unbalanced brackets alone', () => {
    /** The caret is where the `|` is. */
    const typeAt = (marked: string): string | null => {
      const pos = marked.indexOf('|')
      const doc = marked.replace('|', '')
      const change = quoteInputRule(doc, pos, '"', parseTypst(doc))
      return change ? doc.slice(0, change.from) + change.insert + doc.slice(pos) : null
    }
    expect(typeAt('Er sagte "Das ist|')).toBe('Er sagte #quote[Das ist]')
    expect(typeAt('x `Er sagte "Das ist|` y')).toBeNull()
    expect(typeAt('#f("Das ist|")')).toBeNull()
    expect(typeAt('/* Er sagte "Das ist wahr| */')).toBeNull()
    expect(typeAt('Er sagte "Das [ist wahr|')).toBeNull()
    expect(typeAt('Er sagte "Das ] ist wahr|')).toBeNull()
  })

  it('writes something the scanner reads back as one inline quote', () => {
    const before = 'Davor "Mitte danach'
    const change = quoteInputRule(before, before.length, '"', parseTypst(before))!
    const out = before.slice(0, change.from) + change.insert
    const [quote] = scanQuotes(parseTypst(out), out)
    expect(quote).toMatchObject({ block: false, depth: 0 })
    expect(out.slice(quote!.openTo, quote!.closeFrom)).toBe('Mitte danach')
  })
})

describe('the three kinds of quotation', () => {
  it('reads an epigraph by the label behind a block quote, and the extent with it', () => {
    const doc = 'Davor.\n\n#quote(block: true, attribution: [Goethe])[Motto.] <epigraph>\n\nDanach.'
    const [quote] = scan(doc)
    expect(quote).toMatchObject({ block: true, epigraph: true })
    expect(doc.slice(quote!.to, quote!.end)).toBe(' <epigraph>')
    // Without the label it is a block quote, and the label of an inline quote means nothing.
    expect(scan('#quote(block: true)[Zitat]')[0]).toMatchObject({ epigraph: false, end: 26 })
    expect(scan('#quote[Zitat] <epigraph>')[0]).toMatchObject({ block: false, epigraph: false })
    expect(scan('#quote(block: true)[Zitat] <andere>')[0]!.epigraph).toBe(false)
  })

  it('finds the attribution, the argument and what is between its brackets', () => {
    const doc = '#quote(block: true, attribution: [@kant1781[S. 12]])[Text]'
    const { attribution } = scan(doc)[0]!
    expect(doc.slice(attribution!.from, attribution!.to)).toBe('attribution: [@kant1781[S. 12]]')
    expect(doc.slice(attribution!.innerFrom, attribution!.innerTo)).toBe('@kant1781[S. 12]')
    expect(scan('#quote(block: true)[Text]')[0]!.attribution).toBeNull()
    // Only the form in brackets: a label or a call is left as it is.
    expect(scan('#quote(block: true, attribution: <kant>)[Text]')[0]!.attribution).toBeNull()
  })
})

describe('setAttribution', () => {
  const set = (doc: string, source: string | null): string | null => {
    const edit = setAttribution(doc, scan(doc)[0]!, source)
    return edit ? applyAll(doc, [edit]) : null
  }

  it('adds the source as the argument of a block quote, in the style of the arguments it has', () => {
    expect(set('#quote(block: true)[Text]', '@kant1781[S. 12]')).toBe(
      '#quote(block: true, attribution: [@kant1781[S. 12]])[Text]',
    )
  })

  it('changes and removes it, leaving the other arguments alone', () => {
    const doc = '#quote(block: true, attribution: [@a], quotes: false)[Text]'
    expect(set(doc, '@b[S. 1]')).toBe(
      '#quote(block: true, attribution: [@b[S. 1]], quotes: false)[Text]',
    )
    expect(set(doc, null)).toBe('#quote(block: true, quotes: false)[Text]')
    expect(set(doc, '  ')).toBe('#quote(block: true, quotes: false)[Text]')
  })

  it('refuses an inline quote and brackets that do not match', () => {
    expect(set('#quote[Text]', '@a')).toBeNull()
    expect(set('#quote(block: true)[Text]', 'Offen [ nie')).toBeNull()
  })

  it('is read back as the attribution, with the source as it was given', () => {
    const out = set('#quote(block: true)[Text]', 'Goethe, _Faust_')!
    const { attribution } = scan(out)[0]!
    expect(out.slice(attribution!.innerFrom, attribution!.innerTo)).toBe('Goethe, _Faust_')
  })
})

describe('addSourceCitations', () => {
  const add = (doc: string, keys: string[]): { out: string; cited: string } | null => {
    const result = addSourceCitations(doc, scan(doc)[0]!, { keys })
    if (!result) return null
    const out = applyAll(doc, [result.edit])
    return { out, cited: out.slice(result.start, result.start + 5) }
  }

  it('makes the attribution when the quote has none', () => {
    const result = add('#quote(block: true)[Text]', ['kant1781'])
    expect(result?.out).toBe('#quote(block: true, attribution: [@kant1781])[Text]')
    expect(result?.cited).toBe('@kant')
  })

  it('adds to the one it has, as one group', () => {
    const result = add('#quote(block: true, attribution: [@a])[Text]', ['b'])
    expect(result?.out).toBe('#quote(block: true, attribution: [@a @b])[Text]')
    expect(result?.cited).toBe('@b])[')
  })

  it('finds every citation it makes again', () => {
    const doc = '#quote(block: true)[Text]'
    const out = add(doc, ['a', 'b'])!.out
    expect(scanCitations(parseTypst(out), out).map((c) => c.key)).toEqual(['a', 'b'])
  })

  it('does nothing for an inline quote or an epigraph', () => {
    expect(add('#quote[Text]', ['a'])).toBeNull()
    expect(add('#quote(block: true)[Text] <epigraph>', ['a'])).toBeNull()
  })
})

describe('toggleEpigraph', () => {
  it('puts the label behind a block quote, and takes it off again', () => {
    const doc = '#quote(block: true)[Motto]'
    const made = applyAll(doc, [toggleEpigraph(scan(doc)[0]!)!])
    expect(made).toBe('#quote(block: true)[Motto] <epigraph>')
    expect(scan(made)[0]!.epigraph).toBe(true)
    const back = applyAll(made, [toggleEpigraph(scan(made)[0]!)!])
    expect(back).toBe(doc)
  })

  it('does nothing for an inline quote', () => {
    expect(toggleEpigraph(scan('#quote[Text]')[0]!)).toBeNull()
  })
})

describe('removeQuote', () => {
  const remove = (doc: string) => applyAll(doc, removeQuote(doc, scan(doc)[0]!))

  it('takes an inline quote off and keeps its text', () => {
    expect(remove('Er sagte #quote[Hallo Welt] dort.')).toBe('Er sagte Hallo Welt dort.')
  })

  it('takes a block quote off with the line breaks inside its brackets', () => {
    expect(remove('#quote(block: true)[Eins.]\n')).toBe('Eins.\n')
    expect(remove('#quote(block: true)[\nEins.\n\nZwei.\n]\n')).toBe('Eins.\n\nZwei.\n')
  })

  it('keeps the source of a block quote behind its text, and an epigraph loses its label', () => {
    expect(remove('#quote(block: true, attribution: [@kant1781[S. 12]])[Text.]')).toBe(
      'Text. @kant1781[S. 12]',
    )
    expect(remove('#quote(block: true, attribution: [Goethe])[Motto.] <epigraph>\nWeiter.')).toBe(
      'Motto. Goethe\nWeiter.',
    )
  })
})

describe('leaveBlockQuote', () => {
  /** `|` marks the caret; null when Enter is not about leaving a quote. */
  function enter(source: string): string | null {
    const at = source.indexOf('|')
    const doc = source.replace('|', '')
    const result = leaveBlockQuote(doc, scan(doc), at)
    if (!result) return null
    const out = applyAll(doc, result.changes)
    return out.slice(0, result.head) + '|' + out.slice(result.head)
  }

  it('moves an empty last line out of the quote, with the caret on it', () => {
    expect(enter('#quote(block: true)[Eins.\n|]\nDanach.')).toBe(
      '#quote(block: true)[Eins.]\n|\nDanach.',
    )
    expect(enter('#quote(block: true)[Eins.\n|]')).toBe('#quote(block: true)[Eins.]\n|')
  })

  it('leaves behind the label of an epigraph and keeps the source', () => {
    expect(enter('#quote(block: true, attribution: [Goethe])[Motto.\n|] <epigraph>')).toBe(
      '#quote(block: true, attribution: [Goethe])[Motto.] <epigraph>\n|',
    )
  })

  it('removes a quote with nothing else in it', () => {
    expect(enter('Davor.\n#quote(block: true)[\n|]\nDanach.')).toBe('Davor.\n|\nDanach.')
  })

  it('is not about leaving where the line has text, text follows, or the quote opens', () => {
    expect(enter('#quote(block: true)[Eins.|]')).toBeNull()
    expect(enter('#quote(block: true)[Eins.\n|\nZwei.]')).toBeNull()
    expect(enter('#quote(block: true)[|]')).toBeNull()
    expect(enter('Er sagte #quote[Hallo\n|] dort.')).toBeNull()
  })
})
