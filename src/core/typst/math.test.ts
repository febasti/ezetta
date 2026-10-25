import { describe, expect, it } from 'vitest'
import { insertFormula } from './edit'
import {
  formulaAt,
  formulaSource,
  mathDocument,
  parseMathSvg,
  previewProblem,
  scanFormulas,
  updateFormula,
} from './math'
import { parseTypst } from './parser'

const scan = (doc: string) => scanFormulas(parseTypst(doc), doc)
const apply = (doc: string, edit: { from: number; to: number; insert: string } | null): string =>
  edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc

describe('scanFormulas', () => {
  it('finds inline formulas and blocks, told apart by the spaces inside the dollar signs', () => {
    const doc = 'Die Größe $x^2$ wächst.\n\n$ E = m c^2 $ <eq-energie>\n'
    const [inline, block] = scan(doc)
    expect(inline).toMatchObject({ source: 'x^2', display: false, label: null })
    expect(doc.slice(inline!.from, inline!.to)).toBe('$x^2$')
    expect(block).toMatchObject({ source: 'E = m c^2', display: true, label: 'eq-energie' })
    expect(doc.slice(block!.from, block!.end)).toBe('$ E = m c^2 $ <eq-energie>')
  })

  it('reads empty and escaped formulas', () => {
    const [empty, escaped] = scan('A $$ und $ \\$5 + x $.')
    expect(empty).toMatchObject({ source: '', display: false })
    expect(escaped).toMatchObject({ source: '\\$5 + x', display: true })
  })

  it('treats a lone `$ $` as an inline formula, as Typst does', () => {
    expect(scan('A $ $ B')[0]).toMatchObject({ display: false, source: '' })
  })

  it('leaves out formulas in code, raw text, comments, and notes', () => {
    const doc =
      '`$a$` /* $b$ */ #footnote[Mit $c$.] #table(columns: 1, [$d$]) #let x = "$e$"\n\n$f$ und #emph[$g$]'
    expect(scan(doc).map((f) => f.source)).toEqual(['f', 'g'])
  })

  it('does not attach a label to an inline formula', () => {
    expect(scan('$x$ <a>')[0]).toMatchObject({ label: null })
  })

  it('finds the formula around a position', () => {
    const doc = 'A $x$ B'
    expect(formulaAt(scan(doc), 3)?.source).toBe('x')
    expect(formulaAt(scan(doc), 6)).toBeNull()
  })
})

describe('formulaSource', () => {
  it('writes the spaces of a block and none for an inline formula', () => {
    expect(formulaSource('x^2', false)).toBe('$x^2$')
    expect(formulaSource('  x^2 ', false)).toBe('$x^2$')
    expect(formulaSource('x^2', true)).toBe('$ x^2 $')
  })

  it('escapes a dollar sign that would end the formula', () => {
    expect(formulaSource('a $ b', false)).toBe('$a \\$ b$')
    expect(formulaSource('a \\$ b', false)).toBe('$a \\$ b$')
    expect(formulaSource('$$', false)).toBe('$\\$\\$$')
  })
})

describe('updateFormula', () => {
  const doc = 'Text $x^2$ und\n\n$ y = 1 $ <eq-y>\n'
  const [inline, block] = scan(doc)

  it('replaces the source and keeps everything around it, a label included', () => {
    expect(apply(doc, updateFormula(doc, inline!, 'x^3 + 1'))).toBe(
      'Text $x^3 + 1$ und\n\n$ y = 1 $ <eq-y>\n',
    )
    expect(apply(doc, updateFormula(doc, block!, 'y = 2'))).toBe(
      'Text $x^2$ und\n\n$ y = 2 $ <eq-y>\n',
    )
  })

  it('keeps an inline formula inline and a block formula a block, whatever is written', () => {
    const asInline = apply(doc, updateFormula(doc, inline!, '  a + b  '))
    expect(scan(asInline)[0]).toMatchObject({ display: false, source: 'a + b' })
    const asBlock = apply(doc, updateFormula(doc, block!, ' a + b '))
    expect(scan(asBlock)[1]).toMatchObject({ display: true, source: 'a + b', label: 'eq-y' })
  })

  it('writes a dollar sign in the source escaped', () => {
    expect(apply(doc, updateFormula(doc, inline!, '5 $ x'))).toContain('$5 \\$ x$')
  })

  it('does nothing when nothing changes', () => {
    expect(updateFormula(doc, inline!, 'x^2')).toBeNull()
    expect(updateFormula(doc, block!, 'y = 1')).toBeNull()
  })
})

describe('insertFormula', () => {
  const at = (doc: string, from: number, to = from) => ({ doc, tree: parseTypst(doc), from, to })
  const run = (doc: string, from: number, to: number, display: boolean) => {
    const result = insertFormula(at(doc, from, to), { display, random: () => 0 })
    const out = result.changes.reduceRight(
      (text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to),
      doc,
    )
    return { out, caret: result.anchor }
  }

  it('puts a starter formula at the caret', () => {
    const { out, caret } = run('Ein Satz.', 4, 4, false)
    expect(out).toBe('Ein $x$Satz.')
    expect(caret).toBe(7)
  })

  it('turns selected plain text into the formula', () => {
    expect(run('Es gilt a+b hier.', 8, 11, false).out).toBe('Es gilt $a+b$ hier.')
  })

  it('does not use a selection with a dollar sign or several lines as source', () => {
    expect(run('a $b$ c', 0, 5, false).out).toBe('a $b$$x$ c')
  })

  it('puts a block formula in a paragraph of its own, with its id', () => {
    expect(run('Erster Absatz.\n\nZweiter.', 3, 3, true).out).toBe(
      'Erster Absatz.\n\n$ x $ <eq-aaaaaa>\n\nZweiter.',
    )
    expect(run('Ein Absatz.', 11, 11, true).out).toBe('Ein Absatz.\n\n$ x $ <eq-aaaaaa>')
  })

  it('does nothing in code, raw text, math, or comments', () => {
    for (const [doc, pos] of [
      ['`code`', 3],
      ['$x y$', 3],
      ['/* c */', 4],
      ['#f(a b)', 5],
    ] as const)
      expect(insertFormula(at(doc, pos), { display: false }).changes).toEqual([])
  })
})

describe('the page given to the compiler', () => {
  it('draws inline formulas after a baseline marker and blocks on their own', () => {
    expect(mathDocument('x^2', false)).toContain(
      '#box(width: 1pt, height: 1pt, fill: rgb("#fe00fe"))$x^2$',
    )
    expect(mathDocument('x^2', true)).toContain('\n$ x^2 $\n')
    expect(mathDocument('x', true)).toContain('numbering: none')
  })

  it('refuses code, which could read files, and very long sources', () => {
    expect(previewProblem('x^2')).toBeNull()
    expect(previewProblem('#read("/etc/passwd")')).toBe('code')
    expect(previewProblem('a'.repeat(5000))).toBe('too_long')
  })
})

/** The structure the compiler (Typst 0.15) writes, cut down: a marker at the baseline, then a glyph. */
const INLINE_SVG =
  '<svg viewBox="0 0 21 8" width="21pt" height="8pt" xmlns="http://www.w3.org/2000/svg">' +
  '<g transform="translate(0 6)"><path fill="#fe00fe" fill-rule="nonzero" d="M 0 0v 1h 1v -1Z "/></g>' +
  '<g transform="matrix(1 0 0 -1 1 7)"><use xlink:href="#g1" x="0" y="0" fill="#010203" fill-rule="nonzero"/></g>' +
  '<defs><symbol id="g1" overflow="visible"><path d="M 0 0m 1 1c 0 1 1 1 1 0"/></symbol></defs>' +
  '</svg>'

/** The same in Typst 0.13's structure: nested groups and absolute lines. */
const INLINE_SVG_013 = `<svg class="typst-doc" viewBox="0 0 21 8" width="21pt" height="8pt" xmlns="http://www.w3.org/2000/svg">
  <defs><symbol id="g1" overflow="visible"><path d="M 0 0 L 1 1"/></symbol></defs>
  <g>
    <g transform="translate(0 6)">
      <g class="typst-group"><g><g transform="translate(-0 -0)">
        <path class="typst-shape" fill="#fe00fe" fill-rule="nonzero" d="M 0 0 L 0 1 L 1 1 L 1 0 Z "/>
      </g></g></g>
    </g>
    <g transform="translate(1 7)">
      <g class="typst-text" transform="scale(1, -1)"><use xlink:href="#g1" x="0" fill="#010203" fill-rule="nonzero"/></g>
    </g>
  </g>
</svg>`

describe('parseMathSvg', () => {
  it('reads the size and the baseline, cuts off the marker, and recolours the ink', () => {
    const result = parseMathSvg(INLINE_SVG, false)!
    expect(result.width).toBeCloseTo(2) // 20pt at 10pt
    expect(result.height).toBeCloseTo(0.8)
    expect(result.baseline).toBeCloseTo(0.7) // the marker's bottom is at 6 + 1 = 7pt
    expect(result.svg).toContain('viewBox="1 0 20 8" width="20pt" height="8pt"')
    expect(result.svg).toContain('fill="currentColor"')
    expect(result.svg).not.toContain('#010203')
    expect(result.svg).not.toContain('#fe00fe')
  })

  it('reads the baseline from the older structure too', () => {
    expect(parseMathSvg(INLINE_SVG_013, false)!.baseline).toBeCloseTo(0.7)
  })

  it('has no baseline for a block', () => {
    const block = INLINE_SVG.replace(/<g transform="translate\(0 6\)">.*?<\/g>/, '')
    const result = parseMathSvg(block, true)!
    expect(result.baseline).toBeNull()
    expect(result.width).toBeCloseTo(2.1)
  })

  it('refuses anything that is not the expected drawing, or that carries scripts', () => {
    expect(parseMathSvg('<html></html>', false)).toBeNull()
    expect(parseMathSvg(INLINE_SVG.replace('<defs>', '<script>x</script><defs>'), false)).toBeNull()
    expect(parseMathSvg(INLINE_SVG.replace('<g ', '<g onload="x()" '), false)).toBeNull()
  })
})
