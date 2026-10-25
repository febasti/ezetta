import { describe, expect, it } from 'vitest'
import {
  figureAt,
  figureSource,
  newFigureId,
  PLACEHOLDER,
  removeFigure,
  replaceFigureImage,
  scanFigures,
  updateFigure,
} from './figures'
import { parseTypst } from './parser'

const scan = (doc: string) => scanFigures(parseTypst(doc), doc)
const apply = (doc: string, edit: { from: number; to: number; insert: string } | null): string =>
  edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc

const FIGURE =
  '#figure(\n  image("assets/a.png", width: 80%),\n  caption: [Eine _Beschriftung_],\n) <fig-a>'

describe('scanFigures', () => {
  it('reads a figure with its image, caption, label, and extent', () => {
    const doc = `Text.\n\n${FIGURE}\n\nMehr.`
    const [figure] = scan(doc)
    expect(figure).toMatchObject({
      kind: 'figure',
      path: 'assets/a.png',
      width: '80%',
      height: null,
      alt: null,
      label: 'fig-a',
      caption: { text: 'Eine Beschriftung' },
    })
    expect(doc.slice(figure!.from, figure!.end)).toBe(FIGURE)
    expect(doc.slice(figure!.caption!.from, figure!.caption!.to)).toBe('Eine _Beschriftung_')
  })

  it('reads a bare image and an inline image', () => {
    const [bare] = scan('#image("assets/b.jpg", width: 50%)')
    expect(bare).toMatchObject({ kind: 'image', path: 'assets/b.jpg', width: '50%', label: null })
    const [inline] = scan(
      'Text #box(image("assets/icon.png", height: 1em, alt: "Ein \\"Icon\\"")) Text',
    )
    expect(inline).toMatchObject({
      kind: 'inline',
      path: 'assets/icon.png',
      height: '1em',
      alt: 'Ein "Icon"',
    })
  })

  it('reads a label after a bare image, and none after an inline one', () => {
    expect(scan('#image("a.png") <fig-b>')[0]!.label).toBe('fig-b')
    expect(scan('#box(image("a.png")) <fig-b>')[0]!.label).toBeNull()
  })

  it('reads a figure without a caption', () => {
    expect(scan('#figure(image("a.png"))')[0]).toMatchObject({ kind: 'figure', caption: null })
  })

  it('leaves everything else as source: tables, computed paths, notes, comments, raw text', () => {
    expect(scan('#figure(table(columns: 2, [a], [b]), caption: [T])')).toEqual([])
    expect(scan('#figure(image(path), caption: [x])')).toEqual([])
    expect(scan('#box(width: 1em)[x]')).toEqual([])
    expect(scan('A#footnote[#image("a.png")]')).toEqual([])
    expect(scan('/* #image("a.png") */ und `#image("b.png")`')).toEqual([])
  })

  it('keeps arguments it has no field for, and finds the figure around a range', () => {
    const doc = '#figure(image("a.png"), caption: [x], placement: top, supplement: [Bild])'
    const figures = scan(doc)
    expect(figures).toHaveLength(1)
    expect(figureAt(figures, 20)?.from).toBe(0)
    expect(figureAt(figures, doc.length + 5)).toBeNull()
  })
})

describe('figureSource', () => {
  it('writes the three supported forms', () => {
    expect(
      figureSource('figure', {
        path: 'assets/a.png',
        width: '80%',
        caption: 'Text',
        label: 'fig-a',
      }),
    ).toBe('#figure(\n  image("assets/a.png", width: 80%),\n  caption: [Text],\n) <fig-a>')
    expect(figureSource('image', { path: 'assets/a.png', width: '50%' })).toBe(
      '#image("assets/a.png", width: 50%)',
    )
    expect(figureSource('inline', { path: 'assets/i.png', height: '1em', alt: 'Icon' })).toBe(
      '#box(image("assets/i.png", height: 1em, alt: "Icon"))',
    )
  })

  it('writes what the scanner reads back', () => {
    for (const kind of ['figure', 'image', 'inline'] as const) {
      const doc = figureSource(kind, {
        path: 'assets/ä "x".png',
        width: '40%',
        caption: 'Ein Satz',
        label: kind === 'inline' ? null : 'fig-x',
      })
      expect(scan(doc)[0]).toMatchObject({ kind, path: 'assets/ä "x".png' })
    }
  })
})

describe('newFigureId', () => {
  /** A random source that gives the given numbers in turn, so ids are known. */
  const sequence = (...values: number[]) => {
    let n = 0
    return () => values[n++ % values.length]!
  }

  it('makes a fig- label of six random letters and digits, with nothing of a file in it', () => {
    const id = newFigureId('')
    expect(id).toMatch(/^fig-[a-z0-9]{6}$/)
    // 0 is the first character, 0.5 the nineteenth, and 0.999 the last.
    expect(newFigureId('', sequence(0, 0.5, 0.999))).toBe('fig-as9as9')
  })

  it('differs from every label already in the text', () => {
    const taken = newFigureId('', sequence(0))
    expect(taken).toBe('fig-aaaaaa')
    // The next draw would be the same: the generator tries again until the id is free.
    const values = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let n = 0
    expect(newFigureId(`Text <${taken}>`, () => values[n++]!)).toBe('fig-ssssss')
  })
})

describe('placeholder figures', () => {
  const DOC = figureSource('figure', { path: '', caption: 'Folgt', label: 'fig-k4x9tm' })

  it('are written as a plain frame in a figure, which the scanner reads back as empty', () => {
    expect(DOC).toBe(`#figure(\n  ${PLACEHOLDER},\n  caption: [Folgt],\n) <fig-k4x9tm>`)
    expect(scan(DOC)[0]).toMatchObject({
      kind: 'figure',
      empty: true,
      path: '',
      label: 'fig-k4x9tm',
      caption: { text: 'Folgt' },
    })
    expect(scan(FIGURE)[0]!.empty).toBe(false)
  })

  it('are not found in a bare frame, a box, or a figure holding something else', () => {
    expect(scan('#rect(width: 100%)')).toEqual([])
    expect(scan('#box(rect(width: 1em))')).toEqual([])
    expect(scan('#figure(table(columns: 1, [a]), caption: [T])')).toEqual([])
  })

  it('take their first image without losing the id, the caption, or other arguments', () => {
    const doc = `Vor.\n\n${DOC.replace('caption:', 'placement: top,\n  caption:')}\n`
    const figure = scan(doc)[0]!
    const out = apply(doc, replaceFigureImage(figure, 'assets/neu.png', '80%'))
    expect(out).toContain('image("assets/neu.png", width: 80%),')
    expect(out).toContain('placement: top')
    expect(out).toContain('caption: [Folgt]')
    expect(out).toContain('<fig-k4x9tm>')
    expect(scan(out)[0]).toMatchObject({ empty: false, path: 'assets/neu.png', width: '80%' })
  })

  it('ignore a width, as they have no image to size', () => {
    expect(updateFigure(DOC, scan(DOC)[0]!, { width: '50%' })).toBeNull()
  })

  it('can be removed like any figure', () => {
    const doc = `Vor.\n\n${DOC}\n\nNach.\n`
    expect(apply(doc, removeFigure(doc, scan(doc)[0]!))).toBe('Vor.\n\nNach.\n')
  })
})

describe('replaceFigureImage', () => {
  it('changes only the path of a figure with an image: label, caption, and width stay', () => {
    const doc = `A.\n\n${FIGURE}\n`
    const out = apply(doc, replaceFigureImage(scan(doc)[0]!, 'assets/ä "x".png'))
    expect(out).toBe(doc.replace('"assets/a.png"', '"assets/ä \\"x\\".png"'))
    expect(scan(out)[0]).toMatchObject({ path: 'assets/ä "x".png', label: 'fig-a', width: '80%' })
  })
})

describe('updateFigure', () => {
  const edit = (doc: string, patch: Parameters<typeof updateFigure>[2]): string =>
    apply(doc, updateFigure(doc, scan(doc)[0]!, patch))

  it('changes the width in place and nothing else', () => {
    const out = edit(`Vor.\n\n${FIGURE}`, { width: '50%' })
    expect(out).toBe(`Vor.\n\n${FIGURE.replace('80%', '50%')}`)
  })

  it('adds a missing width, alt text, and caption, in the style of the figure', () => {
    expect(edit('#figure(image("a.png"), caption: [x])', { width: '60%' })).toBe(
      '#figure(image("a.png", width: 60%), caption: [x])',
    )
    expect(edit('#figure(image("a.png"))', { caption: 'Neu' })).toBe(
      '#figure(image("a.png"), caption: [Neu])',
    )
    const multi = '#figure(\n  image("a.png"),\n  caption: [x],\n)'
    expect(edit(multi, { alt: 'Ein Bild' })).toBe(
      '#figure(\n  image("a.png", alt: "Ein Bild"),\n  caption: [x],\n)',
    )
    expect(
      edit('#figure(\n  image("a.png"),\n  caption: [x],\n)', { width: '50%', alt: 'A' }),
    ).toContain('image("a.png", width: 50%, alt: "A")')
  })

  it('removes an argument, leaving the others', () => {
    expect(
      edit('#figure(image("a.png", width: 80%, alt: "A"), caption: [x])', { width: null }),
    ).toBe('#figure(image("a.png", alt: "A"), caption: [x])')
    expect(edit('#figure(image("a.png", width: 80%), caption: [x])', { width: null })).toBe(
      '#figure(image("a.png"), caption: [x])',
    )
    expect(edit('#figure(image("a.png"), caption: [x])', { caption: null })).toBe(
      '#figure(image("a.png"))',
    )
  })

  it('keeps arguments it does not know and the label', () => {
    const doc = '#figure(image("a.png"), caption: [x], placement: top, supplement: [Bild]) <fig-a>'
    expect(edit(doc, { caption: 'Neu', width: '70%' })).toBe(
      '#figure(image("a.png", width: 70%), caption: [Neu], placement: top, supplement: [Bild]) <fig-a>',
    )
  })

  it('edits a bare and an inline image', () => {
    expect(edit('#image("a.png", width: 50%)', { width: '25%' })).toBe(
      '#image("a.png", width: 25%)',
    )
    expect(edit('Text #box(image("a.png", height: 1em)) Ende', { height: '2em', alt: 'I' })).toBe(
      'Text #box(image("a.png", height: 2em, alt: "I")) Ende',
    )
  })

  it('refuses a caption with unbalanced brackets, and returns null when nothing changes', () => {
    const doc = '#figure(image("a.png"), caption: [x])'
    expect(updateFigure(doc, scan(doc)[0]!, { caption: 'a ] b' })).toBeNull()
    expect(updateFigure(doc, scan(doc)[0]!, { caption: 'x' })).toBeNull()
    expect(edit(doc, { caption: 'Mit [Klammer] ok' })).toBe(
      '#figure(image("a.png"), caption: [Mit [Klammer] ok])',
    )
  })

  it('returns the smallest edit', () => {
    const doc = `Text davor.\n\n${FIGURE}\n\nText danach.`
    const e = updateFigure(doc, scan(doc)[0]!, { width: '50%' })!
    expect(e.insert).toBe('5')
    expect(e.to - e.from).toBe(1)
  })

  it('escapes quotes in alt text', () => {
    expect(edit('#image("a.png")', { alt: 'Ein "Bild"' })).toBe(
      '#image("a.png", alt: "Ein \\"Bild\\"")',
    )
  })
})

describe('removeFigure', () => {
  const remove = (doc: string): string => apply(doc, removeFigure(doc, scan(doc)[0]!))
  it('takes a figure on its own lines with one blank line, so no gap is left', () => {
    expect(remove(`Vor.\n\n${FIGURE}\n\nNach.`)).toBe('Vor.\n\nNach.')
    expect(remove(`${FIGURE}\n\nNach.`)).toBe('Nach.')
    expect(remove(`Vor.\n\n${FIGURE}`)).toBe('Vor.\n')
    expect(remove(FIGURE)).toBe('')
  })
  it('only takes its own text when it shares a line, as an inline image does', () => {
    expect(remove('Ein #box(image("a.png")) Wort')).toBe('Ein  Wort')
    expect(remove('Text #image("a.png") mehr')).toBe('Text  mehr')
  })
})
