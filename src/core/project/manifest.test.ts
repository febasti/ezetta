import { describe, expect, it } from 'vitest'
import { defaultManifest, parseManifest, serializeManifest } from './manifest'

const sample = `
[project]
version = 1
title = "Dissertation"
language = "de"
bibliography = "library.bib"
citation_style = "apa-7"
custom_key = "keep me"

[goals]
words = 80000

[proofing]
language = "de-DE"
level = "picky"
disabled_rules = ["RULE_A"]
disabled_categories = ["style"]
dictionary = "dictionary.txt"

[order]
"" = ["einleitung", "methoden", "notizen"]
"methoden" = ["design.typ", "daten", "auswertung.typ"]

[items."methoden/design.typ"]
status = "revised"
goal = 1200
note = "unknown item key"

[items."notizen"]
export = false

[[export]]
name = "Abgabe"
template = "monographie"

  [export.options]
  paper = "a4"
`

function parseOk(text: string) {
  const result = parseManifest(text)
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}

describe('parseManifest', () => {
  it('reads the documented structure', () => {
    const { manifest, warnings } = parseOk(sample)
    expect(warnings).toEqual([])
    expect(manifest.project.title).toBe('Dissertation')
    expect(manifest.goals.words).toBe(80000)
    expect(manifest.proofing).toMatchObject({
      language: 'de-DE',
      level: 'picky',
      disabledRules: ['RULE_A'],
      disabledCategories: ['style'],
    })
    expect(manifest.order['methoden']).toEqual(['design.typ', 'daten', 'auswertung.typ'])
    expect(manifest.items['methoden/design.typ']).toMatchObject({ status: 'revised', goal: 1200 })
    expect(manifest.items['notizen']).toEqual({ export: false })
  })

  it('fills defaults for a minimal file', () => {
    const { manifest } = parseOk('[project]\nversion = 1\ntitle = "X"\n')
    expect(manifest.project).toMatchObject({
      language: 'de',
      bibliography: 'library.bib',
      citationStyle: 'apa-7',
    })
    expect(manifest.order).toEqual({})
  })

  it('reports invalid TOML instead of throwing', () => {
    expect(parseManifest('[project\n')).toMatchObject({
      ok: false,
      error: { code: 'invalid_toml' },
    })
  })

  it('refuses a newer manifest version so it is never rewritten by an old app', () => {
    expect(parseManifest('[project]\nversion = 2\n')).toMatchObject({
      ok: false,
      error: { code: 'unsupported_version', version: 2 },
    })
  })

  it('warns about unusable entries and drops them', () => {
    const { manifest, warnings } = parseOk(
      '[project]\nversion = 1\n[items.a]\nstatus = "bogus"\n[order]\nx = "not a list"\n',
    )
    expect(warnings).toHaveLength(2)
    expect(manifest.items['a']).toEqual({})
  })

  it('deduplicates order entries', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n[order]\n"" = ["a", "b", "a"]\n')
    expect(manifest.order['']).toEqual(['a', 'b'])
  })
})

describe('footnote numbering setting', () => {
  it('defaults to continuous and is not written unless changed', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n')
    expect(manifest.footnotes.restart).toBe('continuous')
    expect(serializeManifest(manifest)).not.toContain('footnotes')
  })

  it('reads and writes numbering per chapter, keeping unknown keys', () => {
    const { manifest } = parseOk(
      '[project]\nversion = 1\n[footnotes]\nrestart = "chapter"\nfuture = 1\n',
    )
    expect(manifest.footnotes.restart).toBe('chapter')
    const text = serializeManifest(manifest)
    expect(text).toContain('[footnotes]')
    expect(text).toContain('restart = "chapter"')
    expect(text).toContain('future = 1')
    expect(parseOk(text).manifest).toEqual(manifest)
  })

  it('warns about an invalid value and uses the default', () => {
    const { manifest, warnings } = parseOk(
      '[project]\nversion = 1\n[footnotes]\nrestart = "sometimes"\n',
    )
    expect(manifest.footnotes.restart).toBe('continuous')
    expect(warnings).toHaveLength(1)
  })
})

describe('serializeManifest', () => {
  it('round-trips and keeps unknown content', () => {
    const first = parseOk(sample).manifest
    const text = serializeManifest(first)
    const second = parseOk(text).manifest
    expect(second).toEqual(first)
    expect(text).toContain('custom_key = "keep me"')
    expect(text).toContain('note = "unknown item key"')
    expect(text).toContain('[[export]]')
    expect(text).toContain('template = "monographie"')
  })

  it('is deterministic: serializing twice gives identical text', () => {
    const manifest = parseOk(sample).manifest
    const once = serializeManifest(manifest)
    expect(serializeManifest(parseOk(once).manifest)).toBe(once)
  })

  it('is independent of the insertion order of folders and items', () => {
    const a = defaultManifest('T')
    a.order = { b: ['x.typ'], a: ['y.typ'], '': ['a', 'b'] }
    a.items = { 'b/x.typ': { status: 'final' }, 'a/y.typ': { goal: 5 } }
    const b = defaultManifest('T')
    b.order = { '': ['a', 'b'], a: ['y.typ'], b: ['x.typ'] }
    b.items = { 'a/y.typ': { goal: 5 }, 'b/x.typ': { status: 'final' } }
    expect(serializeManifest(a)).toBe(serializeManifest(b))
  })

  it('omits default item settings', () => {
    const m = defaultManifest('T')
    m.items = { 'a.typ': { status: 'draft', export: true } }
    expect(serializeManifest(m)).not.toContain('[items')
  })

  it('keeps a folder icon through a round trip, and ignores an invalid one with a warning', () => {
    const m = defaultManifest('T')
    m.items = { methoden: { icon: 'flask' } }
    const text = serializeManifest(m)
    expect(text).toContain('icon = "flask"')
    expect(parseOk(text).manifest.items['methoden']).toEqual({ icon: 'flask' })
    const bad = parseOk('[project]\nversion = 1\n[items."a"]\nicon = "Not An Icon!"\n')
    expect(bad.manifest.items['a']).toEqual({})
    expect(bad.warnings).toHaveLength(1)
  })

  it('keeps a folder colour, also one this version does not know, and ignores an invalid one', () => {
    const m = defaultManifest('T')
    m.items = { methoden: { icon: 'square-number-1', color: 'blue' } }
    const text = serializeManifest(m)
    expect(text).toContain('color = "blue"')
    expect(parseOk(text).manifest.items['methoden']).toEqual({
      icon: 'square-number-1',
      color: 'blue',
    })
    expect(
      parseOk('[project]\nversion = 1\n[items."a"]\ncolor = "ultramarine"\n').manifest.items['a'],
    ).toEqual({ color: 'ultramarine' })
    const bad = parseOk('[project]\nversion = 1\n[items."a"]\ncolor = "#ff0000"\n')
    expect(bad.manifest.items['a']).toEqual({})
    expect(bad.warnings).toHaveLength(1)
  })

  it('escapes special characters in titles and paths', () => {
    const m = defaultManifest('Titel "mit" Anführungszeichen \\ und ä')
    m.items = { 'Ordner "x"/Blatt.typ': { status: 'final' } }
    const round = parseOk(serializeManifest(m)).manifest
    expect(round.project.title).toBe(m.project.title)
    expect(round.items['Ordner "x"/Blatt.typ']).toEqual({ status: 'final' })
  })
})

describe('quotation marks around block quotes', () => {
  it('is off by default and not written unless switched on', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n')
    expect(manifest.quotes.blockMarks).toBe(false)
    expect(serializeManifest(manifest)).not.toContain('quotes')
  })

  it('reads and writes the setting, keeping unknown keys', () => {
    const { manifest } = parseOk(
      '[project]\nversion = 1\n[quotes]\nblock_marks = true\nfuture = 1\n',
    )
    expect(manifest.quotes.blockMarks).toBe(true)
    const text = serializeManifest(manifest)
    expect(text).toContain('[quotes]')
    expect(text).toContain('block_marks = true')
    expect(text).toContain('future = 1')
    expect(parseOk(text).manifest).toEqual(manifest)
  })

  it('reads, writes and checks the kind of quotation marks', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n[quotes]\nstyle = "ch"\n')
    expect(manifest.quotes.style).toBe('ch')
    expect(serializeManifest(manifest)).toContain('style = "ch"')
    const bad = parseOk('[project]\nversion = 1\n[quotes]\nstyle = "klingon"\n')
    expect(bad.manifest.quotes.style).toBe('auto')
    expect(bad.warnings).toHaveLength(1)
    expect(serializeManifest(parseOk('[project]\nversion = 1\n').manifest)).not.toContain(
      '[quotes]',
    )
  })

  it('warns about a value that is not true or false and uses the default', () => {
    const { manifest, warnings } = parseOk(
      '[project]\nversion = 1\n[quotes]\nblock_marks = "yes"\n',
    )
    expect(manifest.quotes.blockMarks).toBe(false)
    expect(warnings).toHaveLength(1)
  })
})

describe('versions setting', () => {
  it('is on by default and not written while it is on', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n')
    expect(manifest.history.enabled).toBe(true)
    expect(serializeManifest(manifest)).not.toContain('history')
  })

  it('reads and writes the choice to turn it off, keeping unknown keys', () => {
    const { manifest } = parseOk('[project]\nversion = 1\n[history]\nenabled = false\nfuture = 1\n')
    expect(manifest.history.enabled).toBe(false)
    const text = serializeManifest(manifest)
    expect(text).toContain('[history]')
    expect(text).toContain('enabled = false')
    expect(text).toContain('future = 1')
    expect(parseOk(text).manifest).toEqual(manifest)
  })

  it('warns about a value that is not true or false and keeps them on', () => {
    const { manifest, warnings } = parseOk('[project]\nversion = 1\n[history]\nenabled = "no"\n')
    expect(manifest.history.enabled).toBe(true)
    expect(warnings).toHaveLength(1)
  })
})

describe('proofing settings', () => {
  it('survive a round trip, and an unknown level falls back to the default', () => {
    const first = parseOk(sample).manifest
    const again = parseOk(serializeManifest(first)).manifest
    expect(again.proofing).toEqual(first.proofing)
    expect(
      parseOk('[project]\nversion = 1\ntitle = "X"\n[proofing]\nlevel = "strict"\n').manifest
        .proofing.level,
    ).toBe('default')
  })
})
