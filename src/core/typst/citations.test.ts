import { describe, expect, it } from 'vitest'
import {
  checkSource,
  citationAt,
  citationGroups,
  citationOverview,
  citationSource,
  groupForm,
  groupOf,
  unifyGroup,
  insertCitation,
  insertMissing,
  isCitableKey,
  missingAt,
  missingSource,
  removeCitation,
  removeMissing,
  resolveMissing,
  scanCitations,
  scanMissingCitations,
  setCheck,
  updateCitation,
  addToCitation,
  insertCitations,
} from './citations'
import { parseTypst } from './parser'

const scan = (doc: string) => scanCitations(parseTypst(doc), doc)
const apply = (doc: string, edit: { from: number; to: number; insert: string } | null): string =>
  edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc

describe('scanCitations', () => {
  it('reads the short form with and without a page reference', () => {
    const doc = 'Wie @smith2020 und @jones2019[S. 14] zeigen.'
    const [a, b] = scan(doc)
    expect(a).toMatchObject({ kind: 'short', key: 'smith2020', supplement: null, form: null })
    expect(doc.slice(a!.from, a!.to)).toBe('@smith2020')
    expect(b).toMatchObject({ key: 'jones2019', supplement: 'S. 14' })
    expect(doc.slice(b!.from, b!.to)).toBe('@jones2019[S. 14]')
  })

  it('reads #cite with a page reference, a form, and arguments it does not know', () => {
    const doc = '#cite(<smith2020>, supplement: [S. 14], form: "prose", style: "x")'
    const [c] = scan(doc)
    expect(c).toMatchObject({
      kind: 'long',
      key: 'smith2020',
      supplement: 'S. 14',
      form: 'prose',
      extra: ['style: "x"'],
    })
    expect(doc.slice(c!.from, c!.to)).toBe(doc)
  })

  it('treats the normal form as no form', () => {
    expect(scan('#cite(<a>, form: "normal")')[0]!.form).toBeNull()
  })

  it('leaves cross-references alone: keys with a reserved prefix', () => {
    expect(scan('Siehe @fig-a, @tbl-b, @eq-c, @sec-d und @smith2020.').map((c) => c.key)).toEqual([
      'smith2020',
    ])
  })

  it('reads keys with colons and dots, but not a final full stop', () => {
    const [a, b] = scan('@a:b.c ist, @d.')
    expect(a!.key).toBe('a:b.c')
    expect(b!.key).toBe('d')
  })

  it('does not take an e-mail address for a citation', () => {
    expect(scan('Mail an name@example.org bitte.')).toEqual([])
  })

  it('finds citations in text formats and inline quotes, but not in code, math, raw, comments, notes', () => {
    const doc =
      '*@a* #quote[@b] `@c` $@d$ /* @e */ #footnote[Siehe @f.] #table(columns: 1, [@g]) @h'
    expect(scan(doc).map((c) => c.key)).toEqual(['a', 'b', 'h'])
  })

  it('finds the citation around a position', () => {
    const doc = 'A @k[S. 1] B'
    expect(citationAt(scan(doc), 6)?.key).toBe('k')
    expect(citationAt(scan(doc), 11)).toBeNull()
  })
})

describe('citationSource', () => {
  it('writes the short form when it says everything', () => {
    expect(citationSource({ key: 'smith2020' })).toBe('@smith2020')
    expect(citationSource({ key: 'smith2020', supplement: ' S. 14 ' })).toBe('@smith2020[S. 14]')
  })

  it('writes #cite for a form, extra arguments, or a key that cannot be a reference', () => {
    expect(citationSource({ key: 'a', form: 'prose' })).toBe('#cite(<a>, form: "prose")')
    expect(citationSource({ key: 'a', supplement: 'S. 1', form: 'year' })).toBe(
      '#cite(<a>, supplement: [S. 1], form: "year")',
    )
    expect(citationSource({ key: 'a', extra: ['style: "x"'] })).toBe('#cite(<a>, style: "x")')
    expect(citationSource({ key: 'fig-a' })).toBe('#cite(<fig-a>)')
  })

  it('does not let a short form join the text after it', () => {
    expect(citationSource({ key: 'a', following: 'b' })).toBe('#cite(<a>)')
    expect(citationSource({ key: 'a', following: '[x]' })).toBe('#cite(<a>)')
    expect(citationSource({ key: 'a', following: '.b' })).toBe('#cite(<a>)')
    expect(citationSource({ key: 'a', following: '. Danach' })).toBe('@a')
  })

  it('knows which keys can be references', () => {
    expect(isCitableKey('smith2020')).toBe(true)
    expect(isCitableKey('Smith_2020:a')).toBe(true)
    expect(isCitableKey('fig-a')).toBe(false)
    expect(isCitableKey('a/b')).toBe(false)
  })
})

describe('updateCitation', () => {
  it('sets, changes, and removes the page reference', () => {
    const doc = 'Wie @a zeigt. Und @b[S. 1] auch.'
    const [a, b] = scan(doc)
    expect(apply(doc, updateCitation(doc, a!, { supplement: 'S. 14' }))).toBe(
      'Wie @a[S. 14] zeigt. Und @b[S. 1] auch.',
    )
    expect(apply(doc, updateCitation(doc, b!, { supplement: 'S. 2' }))).toContain('@b[S. 2] auch')
    expect(apply(doc, updateCitation(doc, b!, { supplement: null }))).toContain('Und @b auch')
    expect(apply(doc, updateCitation(doc, b!, { supplement: '  ' }))).toContain('Und @b auch')
  })

  it('changes the work', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    expect(apply(doc, updateCitation(doc, scan(doc)[0]!, { key: 'neu' }))).toBe(
      'Wie @neu[S. 1] zeigt.',
    )
  })

  it('moves to #cite for another form, and back to the short form for the normal one', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    const prose = apply(doc, updateCitation(doc, scan(doc)[0]!, { form: 'prose' }))
    expect(prose).toBe('Wie #cite(<a>, supplement: [S. 1], form: "prose") zeigt.')
    expect(apply(prose, updateCitation(prose, scan(prose)[0]!, { form: null }))).toBe(doc)
  })

  it('keeps arguments it does not know, and stays #cite while they are there', () => {
    const doc = '#cite(<a>, form: "year", style: "x")'
    const out = apply(doc, updateCitation(doc, scan(doc)[0]!, { form: null }))
    expect(out).toBe('#cite(<a>, style: "x")')
  })

  it('refuses a page reference with unbalanced brackets, and does nothing when nothing changes', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    const c = scan(doc)[0]!
    expect(updateCitation(doc, c, { supplement: 'S. [1' })).toBeNull()
    expect(updateCitation(doc, c, { supplement: 'S. 1' })).toBeNull()
    expect(apply(doc, updateCitation(doc, c, { supplement: 'S. [1]' }))).toContain('@a[S. [1]]')
  })

  it('takes a page reference with an escaped bracket, which is text', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    const c = scan(doc)[0]!
    expect(apply(doc, updateCitation(doc, c, { supplement: 'S. 3\\]' }))).toContain('@a[S. 3\\]]')
  })

  it('does not let the new short form join the text after it', () => {
    const doc = '#cite(<a>)b'
    expect(updateCitation(doc, scan(doc)[0]!, { supplement: null })).toBeNull()
  })

  it('removes a citation', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    expect(apply(doc, removeCitation(scan(doc)[0]!))).toBe('Wie  zeigt.')
  })
})

describe('insertCitation', () => {
  const at = (doc: string, from: number, to = from) => ({ doc, tree: parseTypst(doc), from, to })
  const run = (doc: string, from: number, options: Parameters<typeof insertCitation>[1]) => {
    const result = insertCitation(at(doc, from), options)
    const edit = result.changes[0]
    return {
      out: edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc,
      caret: result.anchor,
    }
  }

  it('inserts at the caret, with a space unless one is there', () => {
    expect(run('Wie hier.', 8, { key: 'a' }).out).toBe('Wie hier @a.')
    expect(run('Wie hier. Ja.', 9, { key: 'a' }).out).toBe('Wie hier. @a Ja.')
    expect(run('Wie hier ', 9, { key: 'a' }).out).toBe('Wie hier @a')
    expect(run('Wie (', 5, { key: 'a' }).out).toBe('Wie (@a')
    expect(run('', 0, { key: 'a' }).out).toBe('@a')
  })

  it('puts the caret after the citation', () => {
    const { out, caret } = run('Satz ', 5, { key: 'smith2020', supplement: 'S. 14' })
    expect(out).toBe('Satz @smith2020[S. 14]')
    expect(caret).toBe(out.length)
  })

  it('does nothing in code, raw text, math, and comments, or for a key that cannot be a reference', () => {
    expect(run('`code`', 3, { key: 'a' }).out).toBe('`code`')
    expect(run('$x y$', 3, { key: 'a' }).out).toBe('$x y$')
    expect(run('Text', 2, { key: 'a/b' }).out).toBe('Text')
  })
})

describe('form: none', () => {
  it('is read and written without quotes', () => {
    const doc = 'Text #cite(<a>, form: none) hier.'
    const [c] = scan(doc)
    expect(c).toMatchObject({ key: 'a', form: 'none', extra: [] })
    expect(citationSource({ key: 'a', form: 'none' })).toBe('#cite(<a>, form: none)')
    expect(citationSource({ key: 'a', supplement: 'S. 1', form: 'none' })).toBe(
      '#cite(<a>, supplement: [S. 1], form: none)',
    )
  })

  it('is set and taken off like the other forms', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    const none = apply(doc, updateCitation(doc, scan(doc)[0]!, { form: 'none' }))
    expect(none).toBe('Wie #cite(<a>, supplement: [S. 1], form: none) zeigt.')
    expect(apply(none, updateCitation(none, scan(none)[0]!, { form: null }))).toBe(doc)
  })
})

describe('the check mark', () => {
  it('is a comment right after a citation, with a note or without', () => {
    const doc = 'Wie @a[S. 1]/*#check*/ und @b/*#check: Seite prüfen*/ und #cite(<c>)/*#check*/.'
    const [a, b, c] = scan(doc)
    expect(a!.check).toMatchObject({ note: null })
    expect(doc.slice(a!.from, a!.end)).toBe('@a[S. 1]/*#check*/')
    expect(doc.slice(a!.from, a!.to)).toBe('@a[S. 1]')
    expect(b!.check?.note).toBe('Seite prüfen')
    expect(c!.check).not.toBeNull()
  })

  it('is not an ordinary comment, and a comment elsewhere is not a mark', () => {
    const doc = 'Wie @a/* nur ein Kommentar */ und /*#check*/ allein und @b /*#check*/.'
    const [a, b] = scan(doc)
    expect(a!.check).toBeNull()
    // Spaces and tabs between the citation and the comment are allowed.
    expect(b!.check).not.toBeNull()
  })

  it('belongs to the citation: found at its comment, removed with it', () => {
    const doc = 'Wie @a/*#check*/ zeigt.'
    const c = scan(doc)[0]!
    expect(citationAt(scan(doc), doc.indexOf('check'))?.key).toBe('a')
    expect(apply(doc, removeCitation(c))).toBe('Wie  zeigt.')
  })

  it('is set, changed, and taken off, with no space before the comment', () => {
    const doc = 'Wie @a[S. 1] zeigt.'
    const c = scan(doc)[0]!
    const marked = apply(doc, setCheck(doc, c, { note: 'S. 1 prüfen' }))
    expect(marked).toBe('Wie @a[S. 1]/*#check: S. 1 prüfen*/ zeigt.')
    const m = scan(marked)[0]!
    expect(apply(marked, setCheck(marked, m, { note: null }))).toBe('Wie @a[S. 1]/*#check*/ zeigt.')
    expect(setCheck(marked, m, { note: 'S. 1 prüfen' })).toBeNull()
    expect(apply(marked, setCheck(marked, m, false))).toBe(doc)
    expect(setCheck(doc, c, false)).toBeNull()
  })

  it('stays when the citation is edited', () => {
    const doc = 'Wie @a/*#check: x*/ zeigt.'
    const out = apply(doc, updateCitation(doc, scan(doc)[0]!, { supplement: 'S. 9' }))
    expect(out).toBe('Wie @a[S. 9]/*#check: x*/ zeigt.')
    expect(scan(out)[0]!.check?.note).toBe('x')
  })

  it('cannot hold anything that would end the comment', () => {
    expect(checkSource('a */ b /* c\nd')).toBe('/*#check: a * / b / * c d*/')
  })

  it('is added when a citation is inserted', () => {
    const at = { doc: 'Satz ', tree: parseTypst('Satz '), from: 5, to: 5 }
    const result = insertCitation(at, { key: 'a', check: true })
    expect(result.changes[0]!.insert).toBe('@a/*#check*/')
  })
})

describe('markers cannot be typed by accident', () => {
  it('need the # right after the opening of the comment', () => {
    const doc =
      'Wie @a/* check */ und @b/* check: x */ und @c/*check*/ und /* cite-needed */ und /*cite-needed*/.'
    expect(scan(doc).map((c) => c.check)).toEqual([null, null, null])
    expect(scanMissingCitations(parseTypst(doc), doc)).toEqual([])
  })

  it('are found with the #, with spaces inside the comment as well', () => {
    const doc =
      'Wie @a/*#check*/ und @b/*# check: x */ und /*#cite-needed*/ und /*# cite-needed */.'
    expect(scan(doc).map((c) => c.check?.note ?? 'ohne')).toEqual(['ohne', 'x'])
    expect(scanMissingCitations(parseTypst(doc), doc)).toHaveLength(2)
  })
})

describe('missing-citation markers', () => {
  it('are block comments that say #cite-needed', () => {
    const doc = 'Das stimmt /*#cite-needed*/ und das /*#cite-needed*/ auch /* anders */.'
    const found = scanMissingCitations(parseTypst(doc), doc)
    expect(found).toHaveLength(2)
    expect(doc.slice(found[0]!.from, found[0]!.to)).toBe('/*#cite-needed*/')
  })

  it('take no note: a comment with more text is not one', () => {
    const doc = '/*#cite-needed: Studie*/ und /*#cite-needed*/'
    expect(scanMissingCitations(parseTypst(doc), doc)).toHaveLength(1)
  })

  it('are left out in code, raw text, and notes', () => {
    const doc = '`/*#cite-needed*/` #footnote[Mit /*#cite-needed*/ Marke.] /*#cite-needed*/'
    expect(scanMissingCitations(parseTypst(doc), doc)).toHaveLength(1)
  })

  it('are found around a position', () => {
    const doc = 'A /*#cite-needed*/ B'
    const markers = scanMissingCitations(parseTypst(doc), doc)
    expect(missingAt(markers, 5)).not.toBeNull()
    expect(missingAt(markers, 1)).toBeNull()
  })

  it('are written without a space before them', () => {
    expect(missingSource()).toBe('/*#cite-needed*/')
    const at = { doc: 'Satz', tree: parseTypst('Satz'), from: 4, to: 4 }
    const result = insertMissing(at)
    expect(result.changes[0]!.insert).toBe('/*#cite-needed*/')
    expect(result.anchor).toBe(4 + '/*#cite-needed*/'.length)
    const code = { doc: '`code`', tree: parseTypst('`code`'), from: 3, to: 3 }
    expect(insertMissing(code).changes).toEqual([])
  })

  it('are removed', () => {
    const doc = 'A /*#cite-needed*/ B'
    const m = scanMissingCitations(parseTypst(doc), doc)[0]!
    expect(apply(doc, removeMissing(m))).toBe('A  B')
  })

  it('are replaced by citations, with a space where one is needed', () => {
    const doc = 'Das stimmt/*#cite-needed*/. Und so.'
    const m = scanMissingCitations(parseTypst(doc), doc)[0]!
    expect(apply(doc, resolveMissing(doc, m, { keys: ['smith2020'] }))).toBe(
      'Das stimmt @smith2020. Und so.',
    )
    expect(apply(doc, resolveMissing(doc, m, { keys: ['a', 'b'], check: true }))).toBe(
      'Das stimmt @a/*#check*/ @b/*#check*/. Und so.',
    )
    expect(apply(doc, resolveMissing(doc, m, { keys: ['a'], form: 'year' }))).toBe(
      'Das stimmt #cite(<a>, form: "year"). Und so.',
    )
    const spaced = 'Das /*#cite-needed*/ gilt'
    const s2 = scanMissingCitations(parseTypst(spaced), spaced)[0]!
    expect(apply(spaced, resolveMissing(spaced, s2, { keys: ['a'] }))).toBe('Das @a gilt')
  })
})

describe('citing several works', () => {
  const at = (doc: string, from: number, to = from) => ({ doc, tree: parseTypst(doc), from, to })
  const run = (doc: string, from: number, options: Parameters<typeof insertCitations>[1]) => {
    const result = insertCitations(at(doc, from), options)
    const edit = result.changes[0]
    return {
      out: edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc,
      caret: result.anchor,
    }
  }

  it('writes the citations next to each other, with a space between, for Typst to group', () => {
    const { out, caret } = run('Satz', 4, { keys: ['smith2020', 'jones2019', 'doe2018'] })
    expect(out).toBe('Satz @smith2020 @jones2019 @doe2018')
    expect(caret).toBe(out.length)
    expect(scan(out).map((c) => c.key)).toEqual(['smith2020', 'jones2019', 'doe2018'])
  })

  it('marks every work of the group for checking when asked', () => {
    expect(run('Satz ', 5, { keys: ['a', 'b'], check: true }).out).toBe(
      'Satz @a/*#check*/ @b/*#check*/',
    )
  })

  it('writes the form chosen before the first work, and none for the normal form', () => {
    expect(run('Wie', 3, { keys: ['a'], form: 'prose' }).out).toBe('Wie #cite(<a>, form: "prose")')
    expect(run('Wie', 3, { keys: ['a'], form: 'none' }).out).toBe('Wie #cite(<a>, form: none)')
    expect(run('Wie', 3, { keys: ['a'], form: 'normal' }).out).toBe('Wie @a')
  })

  it('does not let the last citation join the text after it, and leaves out keys that cannot be references', () => {
    expect(run('Satz b', 4, { keys: ['a', 'x'] }).out).toBe('Satz @a @x b')
    expect(run('Satz', 4, { keys: ['a/b', 'c'] }).out).toBe('Satz @c')
    expect(run('Satz', 4, { keys: ['a/b'] }).out).toBe('Satz')
    expect(run('`code`', 3, { keys: ['a', 'b'] }).out).toBe('`code`')
  })

  it('adds works to a citation, behind it and its check mark', () => {
    const doc = 'Wie @a[S. 1]/*#check*/. Danach.'
    const c = scan(doc)[0]!
    expect(apply(doc, addToCitation(doc, c, { keys: ['b', 'c'] }))).toBe(
      'Wie @a[S. 1]/*#check*/ @b @c. Danach.',
    )
    expect(apply(doc, addToCitation(doc, c, { keys: ['b'], check: true }))).toBe(
      'Wie @a[S. 1]/*#check*/ @b/*#check*/. Danach.',
    )
  })
})

describe('groups of citations', () => {
  const groups = (doc: string) => citationGroups(scan(doc), doc).map((g) => g.map((c) => c.key))

  it('are citations separated only by a space, a line break, or nothing at all', () => {
    expect(groups('@a @b @c')).toEqual([['a', 'b', 'c']])
    expect(groups('@a\n@b')).toEqual([['a', 'b']])
    expect(groups('#cite(<a>)#cite(<b>)')).toEqual([['a', 'b']])
    expect(groups('@a[S. 1]/*#check*/ @b')).toEqual([['a', 'b']])
  })

  it('are split by any text, a blank line, or a second line break', () => {
    expect(groups('@a und @b')).toEqual([['a'], ['b']])
    expect(groups('@a; @b')).toEqual([['a'], ['b']])
    expect(groups('@a\n\n@b')).toEqual([['a'], ['b']])
    expect(groups('@a\n \n@b')).toEqual([['a'], ['b']])
  })

  it('mix the short and the long form', () => {
    expect(groups('@a #cite(<b>, form: "prose") @c')).toEqual([['a', 'b', 'c']])
  })

  it('are found from any member', () => {
    const doc = 'Text @a @b und @c'
    const citations = scan(doc)
    expect(groupOf(citations, doc, citations[1]!).map((c) => c.key)).toEqual(['a', 'b'])
    expect(groupOf(citations, doc, citations[2]!).map((c) => c.key)).toEqual(['c'])
  })
})

describe('the form of a group', () => {
  const formOf = (doc: string) => groupForm(citationGroups(scan(doc), doc)[0]!)

  it('is the special form the members share, wherever the normal ones stand', () => {
    expect(formOf('@a @b')).toBeNull()
    expect(formOf('@a #cite(<b>, form: "prose")')).toBe('prose')
    expect(formOf('#cite(<a>, form: "prose") @b')).toBe('prose')
    expect(formOf('#cite(<a>, form: none) @b')).toBe('none')
  })

  it('is the first special form when there are two', () => {
    expect(formOf('#cite(<a>, form: "year") #cite(<b>, form: "prose")')).toBe('year')
  })

  it('is made equal for all members, keeping page references and check marks', () => {
    const doc = 'Wie @a[S. 1]/*#check*/ #cite(<b>, form: "prose") @c zeigen.'
    const edits = unifyGroup(doc, citationGroups(scan(doc), doc)[0]!)
    const out = apply2(doc, edits)
    expect(out).toBe(
      'Wie #cite(<a>, supplement: [S. 1], form: "prose")/*#check*/ #cite(<b>, form: "prose") #cite(<c>, form: "prose") zeigen.',
    )
    expect(unifyGroup(out, citationGroups(scan(out), out)[0]!)).toEqual([])
  })

  it('can be set to a form for the whole group, and back to the normal form', () => {
    const doc = '@a[S. 1] @b'
    const group = citationGroups(scan(doc), doc)[0]!
    const year = apply2(doc, unifyGroup(doc, group, 'year'))
    expect(year).toBe('#cite(<a>, supplement: [S. 1], form: "year") #cite(<b>, form: "year")')
    const again = citationGroups(scan(year), year)[0]!
    expect(apply2(year, unifyGroup(year, again, null))).toBe(doc)
  })

  it('leaves a group of one, and a uniform group, alone', () => {
    expect(unifyGroup('@a', citationGroups(scan('@a'), '@a')[0]!)).toEqual([])
    const doc = '#cite(<a>, form: none) #cite(<b>, form: none)'
    expect(unifyGroup(doc, citationGroups(scan(doc), doc)[0]!)).toEqual([])
  })

  it('is taken by works added to a citation', () => {
    const doc = 'Wie #cite(<a>, form: "prose"). Danach.'
    const c = scan(doc)[0]!
    expect(apply(doc, addToCitation(doc, c, { keys: ['b', 'c'] }))).toBe(
      'Wie #cite(<a>, form: "prose") #cite(<b>, form: "prose") #cite(<c>, form: "prose"). Danach.',
    )
    const none = 'Wie #cite(<a>, form: none).'
    expect(apply(none, addToCitation(none, scan(none)[0]!, { keys: ['b'] }))).toBe(
      'Wie #cite(<a>, form: none) #cite(<b>, form: none).',
    )
  })
})

/** Applies several edits given in the coordinates of the original text. */
function apply2(doc: string, edits: { from: number; to: number; insert: string }[]): string {
  return [...edits]
    .sort((a, b) => b.from - a.from)
    .reduce((text, e) => text.slice(0, e.from) + e.insert + text.slice(e.to), doc)
}

describe('citationOverview', () => {
  const overview = (doc: string) => citationOverview(doc)

  it('lists every citation with where it starts, and the markers', () => {
    const doc =
      'A @a und #cite(<b>, form: "year") und @c[S. 1]/*#check*/ und /*#cite-needed*/ und @a.'
    const o = overview(doc)
    expect(o.works.map(([key]) => key)).toEqual(['a', 'b', 'c', 'a'])
    expect(o.works[0]).toEqual(['a', 2])
    expect(doc.slice(o.works[2]![1], o.works[2]![1] + 2)).toBe('@c')
    expect(o.checks).toEqual([doc.indexOf('/*#check*/')])
    expect(o.missing).toEqual([doc.indexOf('/*#cite-needed*/')])
  })

  it('counts citations in footnotes and in the content of arguments', () => {
    const doc =
      'Text #footnote[Siehe @n1.] und #figure(image("a.png"), caption: [Aus @cap1 und #cite(<cap2>)]) <fig-a> und #table(columns: 1, [@cell]).'
    expect(overview(doc).works.map(([key]) => key)).toEqual(['n1', 'cap1', 'cap2', 'cell'])
    // The position is where the citation is in the whole text.
    const o = overview(doc)
    expect(doc.slice(o.works[1]![1], o.works[1]![1] + 5)).toBe('@cap1')
  })

  it('leaves out cross-references, code, raw text, math, and line comments', () => {
    const doc = 'Siehe @fig-a, `@c`, $@d$, // @e\n#let x = 1\nund @ok.'
    expect(overview(doc).works.map(([key]) => key)).toEqual(['ok'])
  })

  it('does not count a marker in code, or an ordinary comment', () => {
    const o = overview('`/*#cite-needed*/` /* check */ /* anderes */')
    expect(o.missing).toEqual([])
    expect(o.checks).toEqual([])
  })
})

describe('citations in the attribution of a block quote', () => {
  const doc =
    'Davor @a.\n\n#quote(block: true, attribution: [vgl. @kant1781[S. 12] @kant1781[S. 14]/*#check*/])[Text @b]'

  it("are found with their place in the document, as the quote's source", () => {
    const found = scan(doc)
    expect(found.map((c) => c.key)).toEqual(['a', 'kant1781', 'kant1781', 'b'])
    const [, first, second] = found
    expect(doc.slice(first!.from, first!.to)).toBe('@kant1781[S. 12]')
    expect(first).toMatchObject({ supplement: 'S. 12', attributionOf: doc.indexOf('#quote') })
    expect(doc.slice(second!.from, second!.end)).toBe('@kant1781[S. 14]/*#check*/')
    expect(doc.slice(second!.check!.from, second!.check!.to)).toBe('/*#check*/')
    // The text of the quote is the quote's own: a citation in it is not its source.
    expect(found[3]!.attributionOf).toBeUndefined()
  })

  it('print together as one group, like any citations side by side', () => {
    const groups = citationGroups(scan(doc), (a, b) => doc.slice(a, b))
    expect(groups.map((g) => g.map((c) => c.key))).toEqual([['a'], ['kant1781', 'kant1781'], ['b']])
  })

  it('include the long form, and are counted by the overview of the sheet', () => {
    const long = '#quote(block: true, attribution: [#cite(<kant1781>, supplement: [S. 3])])[Text]'
    expect(scan(long)).toMatchObject([{ kind: 'long', key: 'kant1781', supplement: 'S. 3' }])
    expect(citationOverview(long).works.map(([key]) => key)).toEqual(['kant1781'])
    // A source of free text has no citation in it, and an inline quote has no attribution.
    expect(scan('#quote(block: true, attribution: [Goethe, _Faust_])[Text]')).toEqual([])
  })
})
