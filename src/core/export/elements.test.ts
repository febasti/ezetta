import { describe, expect, it } from 'vitest'
import { ELEMENTS, GROUPS, PROPS, SUB_ELEMENTS, elementById, isListed } from './elements'
import { checkValue, parseStyle, resolveStyle, styleToTypst } from './style'

describe('the element registry', () => {
  it('has unique ids, known parents and properties of known types', () => {
    const ids = new Set<string>()
    for (const def of ELEMENTS) {
      expect(ids.has(def.id), `duplicate ${def.id}`).toBe(false)
      ids.add(def.id)
      for (const key of def.props) expect(PROPS[key], `${def.id}.${key}`).toBeDefined()
      for (const key of Object.keys(def.defaults))
        expect(def.props, `${def.id} default ${key}`).toContain(key)
    }
    for (const def of ELEMENTS) if (def.parent) expect(ids.has(def.parent)).toBe(true)
  })

  it('lists parents before their children, so no element depends on a later one', () => {
    const seen = new Set<string>()
    for (const def of ELEMENTS) {
      if (def.parent) expect(seen.has(def.parent), def.id).toBe(true)
      seen.add(def.id)
    }
  })

  it('gives every default a value its property accepts', () => {
    for (const def of ELEMENTS)
      for (const [key, value] of Object.entries(def.defaults))
        if (value !== null) expect(checkValue(PROPS[key]!, value), `${def.id}.${key}`).toBe(value)
  })
})

describe('checkValue', () => {
  it('accepts lengths, colours, fonts, booleans and enum values', () => {
    expect(checkValue(PROPS['size']!, '1.2em')).toBe('1.2em')
    expect(checkValue(PROPS['size']!, '.5em')).toBe('.5em')
    expect(checkValue(PROPS['width']!, '60%')).toBe('60%')
    expect(checkValue(PROPS['color']!, '#AABBCC')).toBe('#aabbcc')
    expect(checkValue(PROPS['font']!, 'Libertinus Serif')).toBe('Libertinus Serif')
    expect(checkValue(PROPS['italic']!, true)).toBe(true)
    expect(checkValue(PROPS['weight']!, 'bold')).toBe('bold')
  })

  it('rejects anything that could be code', () => {
    expect(checkValue(PROPS['size']!, '1em); #panic("x"')).toBeNull()
    expect(checkValue(PROPS['size']!, '12')).toBeNull()
    expect(checkValue(PROPS['color']!, 'red')).toBeNull()
    expect(checkValue(PROPS['font']!, 'A") + eval("1')).toBeNull()
    expect(checkValue(PROPS['italic']!, 'true')).toBeNull()
    expect(checkValue(PROPS['weight']!, 'heavy')).toBeNull()
    expect(checkValue(PROPS['size']!, '')).toBeNull()
  })
})

describe('a text value', () => {
  const prefix = PROPS['number_prefix']!

  it('is kept as typed, with its spaces', () => {
    expect(checkValue(prefix, 'Kapitel ')).toBe('Kapitel ')
    expect(checkValue(prefix, 'Teil §')).toBeNull()
    expect(checkValue(prefix, 'Kap. (A)')).toBe('Kap. (A)')
  })

  it('is refused when it could be markup or code', () => {
    for (const bad of ['#panic()', 'a"b', 'a\\b', '$x$', '[x]', 'x'.repeat(41), '   ', '']) {
      expect(checkValue(prefix, bad), bad).toBeNull()
    }
  })

  it('is written to the compiler as a string', () => {
    const typst = styleToTypst(parseStyle('[element.heading]\nnumber_prefix = "Kapitel "').style)
    expect(typst).toContain('number_prefix: "Kapitel "')
  })
})

describe('the palette', () => {
  it('lets a colour name a colour of the palette, and follows it', () => {
    const { style, problems } = resolveStyle({
      element: {
        palette: { accent: '#b00020' },
        link: { color: 'accent' },
        heading_1: { color: 'accent_secondary' },
      },
    })
    expect(problems).toEqual([])
    expect(style['link']!['color']).toBe('#b00020')
    expect(style['heading_1']!['color']).toBe('#666666')
    expect(style['heading_2']!['color']).toBe('#000000')
  })

  it('keeps the name where the editor asks for it', () => {
    const doc = { element: { link: { color: 'accent' } } }
    expect(resolveStyle(doc, { keepTokens: true }).style['link']!['color']).toBe('accent')
    expect(resolveStyle(doc).style['link']!['color']).toBe('#1a56b0')
  })

  it('does not take a name for the colour of the palette itself, nor an unknown name', () => {
    const { style, problems } = resolveStyle({
      element: { palette: { accent: 'accent_secondary' }, link: { color: 'blue' } },
    })
    expect(problems.map((p) => p.where).sort()).toEqual(['link.color', 'palette.accent'])
    expect(style['palette']!['accent']).toBe('#1a56b0')
  })

  it('is part of the style that goes to the compiler as hex, never as a name', () => {
    const typst = styleToTypst(parseStyle('[element.link]\ncolor = "accent"').style)
    expect(typst).toContain('link: (color: rgb("#1a56b0")')
  })
})

describe('resolveStyle', () => {
  it('inherits from the parent when an element sets nothing', () => {
    const { style, problems } = resolveStyle({
      element: { body: { font: 'New Computer Modern' }, heading_2: { size: '2em' } },
    })
    expect(problems).toEqual([])
    expect(style['heading']!['font']).toBe('New Computer Modern')
    expect(style['heading_2']!['size']).toBe('2em')
    expect(style['code']!['color']).toBe('#000000')
  })

  it('lets a level of heading override what all headings set', () => {
    const { style } = resolveStyle({
      element: { heading: { weight: 'semibold' }, heading_4: { weight: 'regular' } },
    })
    expect(style['heading_1']!['weight']).toBe('semibold')
    expect(style['heading_4']!['weight']).toBe('regular')
  })

  it('prefers an element’s own default over its parent', () => {
    const { style } = resolveStyle({ element: { quote: { italic: false } } })
    expect(style['epigraph']!['italic']).toBe(true)
  })

  it('reports and ignores unknown names and invalid values', () => {
    const { style, problems } = resolveStyle({
      element: {
        nope: { size: '1em' },
        body: { size: 'big', colour: '#000000', justify: true },
      },
    })
    expect(problems.map((p) => p.where).sort()).toEqual(['body.colour', 'body.size', 'nope'])
    expect(style['body']!['size']).toBe('11pt')
  })

  it('gives a style of defaults for text that is not TOML', () => {
    const { style, problems } = parseStyle('element = [')
    expect(problems[0]!.where).toBe('style.toml')
    expect(style['body']!['font']).toBe('Libertinus Serif')
  })

  it('knows each element by id', () => {
    expect(elementById('heading_1')?.parent).toBe('heading')
    expect(elementById('nothing')).toBeUndefined()
  })
})

describe('the break before a heading', () => {
  it('is a new page for a chapter, and none for the other levels, unless the style says so', () => {
    const { style } = parseStyle('[element.heading_2]\nbreak_before = "odd"')
    expect(style['heading_1']!['break_before']).toBe('page')
    expect(style['heading_2']!['break_before']).toBe('odd')
    expect(style['heading_3']!['break_before']).toBe('none')
  })

  it('reads the old yes or no of a style written before', () => {
    const { style, problems } = parseStyle(
      '[element.heading_1]\npage_break_before = false\n[element.heading_2]\npage_break_before = true\n[element.heading_3]\npage_break_before = true\nbreak_before = "odd"',
    )
    expect(problems).toEqual([])
    expect(style['heading_1']!['break_before']).toBe('none')
    expect(style['heading_2']!['break_before']).toBe('page')
    expect(style['heading_3']!['break_before']).toBe('odd')
  })
})

describe('styleToTypst', () => {
  it('writes every element as a dictionary of literals', () => {
    const typst = styleToTypst(parseStyle('[element.body]\nfont = "A B"\nsize = "10pt"').style)
    expect(typst).toContain('#let style = (')
    expect(typst).toContain('body: (font: "A B", size: 10pt,')
    expect(typst).toContain('heading_1: (size: 1.9em,')
    expect(typst).toContain('color: rgb("#000000")')
    expect(typst).toContain('first_line_indent: none')
    expect(typst).toContain('italic: false')
  })

  it('writes a length that starts with a dot as a number Typst reads', () => {
    expect(styleToTypst(parseStyle('[element.body]\nparagraph_spacing = ".5em"').style)).toContain(
      'paragraph_spacing: 0.5em',
    )
  })

  it('has a line for each element in the registry', () => {
    const typst = styleToTypst(parseStyle('').style)
    for (const def of ELEMENTS) expect(typst).toContain(`  ${def.id}: (`)
  })
})

describe('the entries of the editor', () => {
  it('list every element once: on its own, or below the element it belongs to', () => {
    const below = Object.values(SUB_ELEMENTS).flat()
    expect(new Set(below).size).toBe(below.length)
    for (const [parent, ids] of Object.entries(SUB_ELEMENTS)) {
      expect(elementById(parent), parent).toBeDefined()
      expect(isListed(parent)).toBe(true)
      for (const id of ids) {
        expect(elementById(id), id).toBeDefined()
        expect(isListed(id)).toBe(false)
      }
    }
    expect(ELEMENTS.filter((e) => isListed(e.id)).length + below.length).toBe(ELEMENTS.length)
  })
  it('keep the caption of a figure and of a table, the epigraph source and the title page parts below their parents', () => {
    expect(SUB_ELEMENTS['epigraph']).toEqual(['epigraph_source'])
    expect(SUB_ELEMENTS['figure']).toEqual(['figure_caption'])
    expect(SUB_ELEMENTS['table']).toEqual(['table_caption'])
    expect(SUB_ELEMENTS['title_page']).toEqual([
      'title_page_title',
      'title_page_subtitle',
      'title_page_author',
      'title_page_date',
    ])
  })
  it('put every element in a group that exists', () => {
    const groups = new Set(GROUPS.map((g) => g.id))
    for (const e of ELEMENTS) expect(groups.has(e.group), e.id).toBe(true)
  })
  it('have no group without an entry', () => {
    for (const group of GROUPS)
      expect(
        ELEMENTS.some((e) => e.group === group.id && isListed(e.id)),
        group.id,
      ).toBe(true)
  })
})

describe('the contents, the lists and the citations', () => {
  const resolved = (sets: Record<string, Record<string, string | boolean>>) =>
    resolveStyle({ element: sets }).style
  it('give a list of figures the text of the contents, but not its title', () => {
    const style = resolved({
      contents: { font: 'DejaVu Sans Mono', title_text: 'Inhalt', leader: 'none' },
    })
    expect(style['list_of_figures']!['font']).toBe('DejaVu Sans Mono')
    expect(style['list_of_tables']!['leader']).toBe('none')
    expect(style['list_of_figures']!['list_title']).toBeNull()
    expect(
      resolved({ list_of_figures: { list_title: 'Bilder' } })['list_of_figures']!['list_title'],
    ).toBe('Bilder')
  })
  it('hand the title of a list to the engine', () => {
    const typst = styleToTypst(resolved({ list_of_tables: { list_title: 'Tabellen' } }))
    expect(typst).toMatch(/list_of_tables: \(.*list_title: "Tabellen"/s)
  })
  it('keep the citations and the references to what is around them unless they say otherwise', () => {
    const style = resolved({ body: { color: '#112233' } })
    expect(style['citations']!['color']).toBeNull()
    expect(style['citations']!['underline']).toBe(false)
    expect(style['references']!['color']).toBeNull()
  })
  it('have the entries in the groups of the list', () => {
    const entries = (group: string) =>
      ELEMENTS.filter((e) => e.group === group && isListed(e.id)).map((e) => e.id)
    expect(entries('indexes')).toEqual([
      'contents',
      'list_of_figures',
      'list_of_tables',
      'bibliography',
    ])
    expect(entries('references')).toEqual(['references', 'citations', 'footnote', 'link'])
    expect(entries('code')).toEqual(['code'])
    expect(entries('page')).toContain('palette')
    expect(entries('lists')).toEqual(['list'])
  })
})

describe('the footnotes in the margin', () => {
  it('are off by default, with a column of 4.5 cm and a distance of 0.7 cm', () => {
    const style = resolveStyle({ element: {} }).style
    expect(style['footnote']).toMatchObject({
      placement: 'bottom',
      margin_width: '4.5cm',
      margin_gap: '0.7cm',
    })
  })
  it('accept the two places and refuse another', () => {
    const def = PROPS['placement']!
    expect(checkValue(def, 'margin', false)).toBe('margin')
    expect(checkValue(def, 'bottom', false)).toBe('bottom')
    expect(checkValue(def, 'top', false)).toBeNull()
    expect(checkValue(PROPS['margin_width']!, '5cm', false)).toBe('5cm')
  })
})

describe('facing pages or single pages', () => {
  it('are facing pages by default, as the templates were before', () => {
    expect(resolveStyle({ element: {} }).style['page']!['facing']).toBe('facing')
  })
  it('accept the two layouts and refuse another', () => {
    const def = PROPS['facing']!
    expect(checkValue(def, 'single', false)).toBe('single')
    expect(checkValue(def, 'facing', false)).toBe('facing')
    expect(checkValue(def, 'spread', false)).toBeNull()
  })
})
