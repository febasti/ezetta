import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMathRenderer, findTypst, firstError, spawnTypst } from './mathRenderer'
import type { TypstRunner } from './mathRenderer'

const SVG = `<svg viewBox="0 0 21 8" width="21pt" height="8pt"><g><g transform="translate(0 6)"><path fill="#fe00fe" d="M 0 0 L 0 1 L 1 1 L 1 0 Z "/></g><use fill="#010203"/></g></svg>`

describe('createMathRenderer', () => {
  it('draws a formula from the compiler output', async () => {
    const pages: string[] = []
    const run: TypstRunner = async (input) => {
      pages.push(input)
      return { code: 0, stdout: SVG, stderr: '' }
    }
    const result = await createMathRenderer(run).render('x^2', false)
    expect(result).toMatchObject({ ok: true, baseline: 0.7 })
    expect(pages[0]).toContain('$x^2$')
  })

  it('reports the first compiler error', async () => {
    const run: TypstRunner = async () => ({
      code: 1,
      stdout: '',
      stderr:
        '<stdin>:4:2: error: unknown variable: foo\n  hint: if you meant to display multiple letters\n',
    })
    expect(await createMathRenderer(run).render('foo(x)', true)).toEqual({
      ok: false,
      reason: 'invalid',
      message: 'unknown variable: foo',
      at: 0,
    })
  })

  it('does not run the compiler for code in a formula', async () => {
    let called = false
    const run: TypstRunner = async () => {
      called = true
      return { code: 0, stdout: SVG, stderr: '' }
    }
    expect(await createMathRenderer(run).render('#read("/etc/passwd")', false)).toMatchObject({
      ok: false,
      reason: 'code',
    })
    expect(called).toBe(false)
  })

  it('says so when the compiler cannot be started, and when its output is not a drawing', async () => {
    const missing: TypstRunner = async () => {
      throw new Error('ENOENT')
    }
    expect(await createMathRenderer(missing).render('x', false)).toMatchObject({
      reason: 'unavailable',
    })
    const odd: TypstRunner = async () => ({ code: 0, stdout: 'hello', stderr: '' })
    expect(await createMathRenderer(odd).render('x', false)).toMatchObject({ reason: 'invalid' })
  })

  it('runs only a few compilers at once', async () => {
    let running = 0
    let most = 0
    const run: TypstRunner = async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return { code: 0, stdout: SVG, stderr: '' }
    }
    const renderer = createMathRenderer(run, { concurrency: 2 })
    await Promise.all(Array.from({ length: 8 }, (_, i) => renderer.render(`x${i}`, false)))
    expect(most).toBe(2)
  })
})

describe('firstError', () => {
  it('drops the position and keeps the message', () => {
    expect(firstError('<stdin>:3:1: error: expected expression')).toBe('expected expression')
    expect(firstError('')).toBe('Could not draw the formula')
  })
})

describe('findTypst', () => {
  it('prefers the packaged copy, then a named one, then common places, then the PATH', () => {
    const has =
      (...paths: string[]) =>
      (p: string) =>
        paths.includes(p)
    expect(
      findTypst({
        resourcesPath: '/r',
        override: '/o/typst',
        platform: 'darwin',
        exists: has(join('/r', 'typst', 'typst'), '/o/typst'),
      }),
    ).toBe(join('/r', 'typst', 'typst'))
    expect(
      findTypst({ override: '/o/typst', exists: has('/o/typst', '/opt/homebrew/bin/typst') }),
    ).toBe('/o/typst')
    expect(findTypst({ exists: has('/usr/local/bin/typst') })).toBe('/usr/local/bin/typst')
    expect(findTypst({ exists: () => false })).toBe('typst')
  })
  it('looks for typst.exe in the package on Windows', () => {
    const packaged = join('/r', 'typst', 'typst.exe')
    expect(
      findTypst({ resourcesPath: '/r', platform: 'win32', exists: (p) => p === packaged }),
    ).toBe(packaged)
  })
})

// With a compiler installed, one real formula goes all the way through.
const binary = findTypst({ override: process.env['EZETTA_TYPST'] })
const installed = binary !== 'typst'
describe.skipIf(!installed)('with the real Typst compiler', () => {
  const renderer = createMathRenderer(spawnTypst(binary))

  it('draws an inline formula with a baseline inside its height', async () => {
    const result = await renderer.render('x^2 + sum_(i=1)^n frac(a_i, b)', false)
    if (!result.ok) throw new Error(result.message)
    expect(result.width).toBeGreaterThan(3)
    expect(result.baseline).not.toBeNull()
    expect(result.baseline!).toBeGreaterThan(0.3)
    expect(result.baseline!).toBeLessThan(result.height)
    expect(result.svg).toContain('currentColor')
    expect(result.svg).not.toContain('#fe00fe')
  })

  it('draws a block formula and reports a broken one', async () => {
    const block = await renderer.render('E = m c^2', true)
    expect(block).toMatchObject({ ok: true, baseline: null })
    const broken = await renderer.render('foo(x)', false)
    expect(broken).toMatchObject({ ok: false, reason: 'invalid' })
    expect((broken as { message: string }).message).toMatch(/unknown variable/)
    // Where it is, in the formula's own source, for a formula in the text and for a block.
    expect(broken).toMatchObject({ at: 0 })
    expect(await renderer.render('x + foo(y)', true)).toMatchObject({ at: 4 })
    expect(await renderer.render('frac(1', true)).toMatchObject({
      message: 'unclosed delimiter',
      at: 4,
    })
    expect(await renderer.render('\\alpha', true)).toMatchObject({ at: 2 })
    expect(await renderer.render('x^', false)).toMatchObject({ message: 'expected expression' })
  })
})
