import { describe, expect, it } from 'vitest'
import {
  applyOptionOverrides,
  cleanName,
  fontFileName,
  customToToml,
  mergeSets,
  newTemplateId,
  optionAccepts,
  parseCustom,
  parseSets,
  setOptionOverride,
  setValue,
  setsToToml,
} from './custom'
import { resolveOptions } from './template'
import type { TemplateOption } from './template'
import { parseStyle } from './style'

describe('sets', () => {
  it('reads only the values that are valid for their property', () => {
    const sets = parseSets(
      '[element.body]\nfont = "A"\nsize = "big"\n[element.nope]\nx = "1"\n[element.heading_2]\nsize = "2em"',
    )
    expect(sets).toEqual({ body: { font: 'A' }, heading_2: { size: '2em' } })
  })

  it('reads the old break before a heading as the new one', () => {
    expect(parseSets('[element.heading_1]\npage_break_before = false')).toEqual({
      heading_1: { break_before: 'none' },
    })
  })

  it('treats text that is not TOML as setting nothing', () => {
    expect(parseSets('[[[')).toEqual({})
  })

  it('merges property by property, the later on top', () => {
    const merged = mergeSets(
      { body: { font: 'A', size: '10pt' }, code: { size: '1em' } },
      { body: { size: '12pt' }, quote: { italic: true } },
    )
    expect(merged).toEqual({
      body: { font: 'A', size: '12pt' },
      code: { size: '1em' },
      quote: { italic: true },
    })
  })

  it('writes TOML that reads back to the same values', () => {
    const sets = { body: { font: 'A B', justify: false }, heading_1: { size: '2em' } }
    expect(parseSets(setsToToml(sets))).toEqual(sets)
    expect(setsToToml({})).toContain('engine = 2')
  })

  it('resolves a written style like a bundled one', () => {
    const { style, problems } = parseStyle(setsToToml({ body: { size: '9pt' } }))
    expect(problems).toEqual([])
    expect(style['body']!['size']).toBe('9pt')
  })
})

describe('setValue', () => {
  it('sets a value, and removes it again with null', () => {
    const a = setValue({}, 'heading_2', 'size', '1.5em')
    expect(a).toEqual({ ok: true, sets: { heading_2: { size: '1.5em' } } })
    const b = setValue(a.ok ? a.sets : {}, 'heading_2', 'size', null)
    expect(b).toEqual({ ok: true, sets: {} })
  })

  it('does not change the sets it was given', () => {
    const before = { body: { font: 'A' } }
    setValue(before, 'body', 'font', 'B')
    expect(before).toEqual({ body: { font: 'A' } })
  })

  it('takes a name of a palette colour for a colour, but not for the palette', () => {
    expect(setValue({}, 'link', 'color', 'accent').ok).toBe(true)
    expect(setValue({}, 'palette', 'accent', 'accent').ok).toBe(false)
    expect(parseSets('[element.link]\ncolor = "accent_secondary"')).toEqual({
      link: { color: 'accent_secondary' },
    })
    expect(parseSets('[element.palette]\naccent = "accent_secondary"')).toEqual({})
  })

  it('refuses unknown elements and properties and values that do not fit', () => {
    expect(setValue({}, 'nope', 'size', '1em').ok).toBe(false)
    expect(setValue({}, 'body', 'width', '1em').ok).toBe(false)
    expect(setValue({}, 'body', 'size', '1em); #x(').ok).toBe(false)
    expect(setValue({}, 'body', 'justify', 'yes').ok).toBe(false)
  })
})

describe('custom.toml', () => {
  it('reads and writes the name and the base', () => {
    const text = customToToml({
      id: 'meine',
      name: 'Meine "Vorlage"',
      base: 'essay',
      options: {},
    })
    expect(parseCustom(text)).toEqual({
      id: 'meine',
      name: 'Meine "Vorlage"',
      base: 'essay',
      options: {},
    })
  })

  it('is not read from a file without an id, a base or a name', () => {
    expect(parseCustom('name = "A"\nbase = "essay"')).toBeNull()
    expect(parseCustom('id = "a"\nname = "A"')).toBeNull()
    expect(parseCustom('id = "a"\nbase = "b"\nname = " "')).toBeNull()
    expect(parseCustom('id = "../x"\nbase = "b"\nname = "A"')).toBeNull()
    expect(parseCustom('[[[')).toBeNull()
  })
})

describe('names and ids', () => {
  it('tidies a name', () => {
    expect(cleanName('  Meine   Arbeit ')).toBe('Meine Arbeit')
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('x'.repeat(200))).toHaveLength(80)
  })

  it('makes an id from the name that is not taken', () => {
    expect(newTemplateId('Meine Monographie', [])).toBe('meine-monographie')
    expect(newTemplateId('Größe & Maß', [])).toBe('grosse-mass')
    expect(newTemplateId('Essay', ['essay'])).toBe('essay-2')
    expect(newTemplateId('Essay', ['essay', 'essay-2'])).toBe('essay-3')
    expect(newTemplateId('2024', [])).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(newTemplateId('???', [])).toMatch(/^[a-z][a-z0-9-]*$/)
  })
})

describe('fontFileName', () => {
  it('keeps font files by their plain name, whatever path they came with', () => {
    expect(fontFileName('/Users/a/Fonts/Garamond Pro.otf')).toBe('Garamond Pro.otf')
    expect(fontFileName('C:\\Fonts\\Lato-Regular.TTF')).toBe('Lato-Regular.ttf')
    expect(fontFileName('../../Mono.ttc')).toBe('Mono.ttc')
  })

  it('refuses what is not a font file, and makes odd names plain', () => {
    expect(fontFileName('notes.txt')).toBeNull()
    expect(fontFileName('font.woff2')).toBeNull()
    expect(fontFileName('.ttf')).toBeNull()
    expect(fontFileName('no-extension')).toBeNull()
    expect(fontFileName('a<b>:"c".ttf')).toBe('a_b___c_.ttf')
    expect(fontFileName('..hidden.ttf')).toBe('hidden.ttf')
  })
})

describe('options of a custom template', () => {
  const label = { de: 'x', en: 'x' }
  const base: TemplateOption[] = [
    { id: 'title_page', type: 'bool', label, default: true },
    {
      id: 'paper',
      type: 'enum',
      label,
      default: 'a4',
      values: [
        { id: 'a4', label },
        { id: 'us-letter', label },
      ],
    },
    { id: 'author', type: 'text', label, default: '' },
  ]

  it('are read and written in custom.toml, as default and hidden', () => {
    const text = customToToml({
      id: 'a',
      name: 'A',
      base: 'essay',
      options: { title_page: { default: false, hidden: true }, author: { default: 'Ich' } },
    })
    expect(parseCustom(text)?.options).toEqual({
      title_page: { default: false, hidden: true },
      author: { default: 'Ich' },
    })
  })

  it('ignore what is not an option change', () => {
    const text =
      'id = "a"\nname = "A"\nbase = "b"\n[options.title_page]\ndefault = 3\nhidden = "yes"\n[options."Bad Key"]\nhidden = true'
    expect(parseCustom(text)?.options).toEqual({})
  })

  it('change a default and hide an option, as far as the option takes the value', () => {
    const changed = applyOptionOverrides(base, {
      title_page: { default: false, hidden: true },
      paper: { default: 'us-letter' },
      author: { default: 'x'.repeat(600) },
    })
    expect(changed[0]).toMatchObject({ default: false, hidden: true })
    expect(changed[1]).toMatchObject({ default: 'us-letter' })
    expect(changed[2]).toMatchObject({ default: '' })
    expect(base[0]).toMatchObject({ default: true })
  })

  it('are checked against the option', () => {
    expect(optionAccepts(base[0]!, false)).toBe(true)
    expect(optionAccepts(base[0]!, 'false')).toBe(false)
    expect(optionAccepts(base[1]!, 'a5')).toBe(false)
    expect(optionAccepts(base[2]!, 'a\nb')).toBe(false)
  })

  it('are set one field at a time, and taken back', () => {
    const one = setOptionOverride({}, base, 'paper', { default: 'us-letter' })
    expect(one).toEqual({ paper: { default: 'us-letter' } })
    const two = setOptionOverride(one!, base, 'paper', { hidden: true })
    expect(two).toEqual({ paper: { default: 'us-letter', hidden: true } })
    expect(setOptionOverride(two!, base, 'paper', { default: null, hidden: null })).toEqual({})
    expect(setOptionOverride({}, base, 'paper', { default: 'a5' })).toBeNull()
    expect(setOptionOverride({}, base, 'nope', { hidden: true })).toBeNull()
  })

  it('make an option that is not offered keep its default whatever a profile says', () => {
    const options = applyOptionOverrides(base, { title_page: { default: false, hidden: true } })
    const info = { id: 'a', name: label, description: label, options }
    expect(resolveOptions(info, { title_page: true })).toMatchObject({ title_page: false })
    expect(resolveOptions(info, { paper: 'us-letter' })).toMatchObject({ paper: 'us-letter' })
  })
})
