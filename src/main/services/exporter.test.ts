import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectSession } from '@core/project/session'
import {
  countPages,
  createExporter,
  listFontFamilies,
  loadTemplates,
  spawnCompiler,
} from './exporter'
import type { Compiler } from './exporter'
import { findTypst } from './mathRenderer'
import { createRootedFs } from './rootedFs'
import type { ProjectHost } from './projectHost'
import { defaultProfile } from '@core/export/profile'

const binary = findTypst({ override: process.env['EZETTA_TYPST'] })
const installed = binary !== 'typst'
const TEMPLATES = resolve('templates')

/** A 1 × 1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const BIB = '@book{smith2020, author = {Smith, Anna}, title = {Eine Studie}, year = {2020}}\n'

const SHEETS: Record<string, string> = {
  'einleitung/einleitung.typ': [
    '= Einleitung <sec-einleitung>',
    '',
    'Ein Satz mit ::Markierung::, einer Fußnote#footnote[Ein Fuß mit @smith2020.] und Beleg @smith2020[S. 4].',
    '/* Das ist noch offen */',
    '',
    'Siehe @sec-methoden und @eq-energie und @fig-bild und @tbl-werte.',
    '',
    '$ E = m c^2 $ <eq-energie>',
    '',
    '#figure(image("assets/bild.png", width: 40%), caption: [Ein Bild]) <fig-bild>',
  ].join('\n'),
  'methoden/design.typ': [
    '= Methoden <sec-methoden>',
    '',
    'Zurück zu @sec-einleitung.',
    '',
    '#figure(table(columns: 2, table.header[A][B], [1], [2]), caption: [Werte]) <tbl-werte>',
    '',
    '#quote(block: true)[Ein langes Zitat, das in einem eigenen Block steht.]',
  ].join('\n'),
}

let dir: string | null = null
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

async function project(sheets: Record<string, string> = SHEETS) {
  dir = await mkdtemp(join(tmpdir(), 'wm-export-'))
  const root = join(dir, 'Arbeit')
  await mkdir(root, { recursive: true })
  const fs = createRootedFs(root, () => Promise.resolve())
  const created = await ProjectSession.create(fs, 'Meine Arbeit', 'de')
  if (!created.ok) throw new Error('no project')
  await writeFile(join(root, 'library.bib'), BIB)
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'assets', 'bild.png'), PNG)
  for (const [path, text] of Object.entries(sheets)) {
    await mkdir(join(root, 'content', dirname(path)), { recursive: true })
    await writeFile(join(root, 'content', path), text)
  }
  // Open it again, now that its files are there.
  const opened = await ProjectSession.open(fs)
  if (!opened.ok) throw new Error('not opened')
  return { root, session: opened.value, target: join(dir, 'out', 'Arbeit.pdf') }
}

function exporter(session: ProjectSession, root: string, target: string | null) {
  const host = { session: () => session, root } as unknown as ProjectHost
  return createExporter({
    host,
    templatesDir: TEMPLATES,
    compiler: spawnCompiler(binary),
    available: () => Promise.resolve(installed),
    pickSavePath: () => Promise.resolve(target),
    log: () => undefined,
  })
}

describe('loadTemplates', () => {
  it('finds the bundled templates with their options, the shared engine and the prelude', async () => {
    const { templates, prelude } = await loadTemplates(TEMPLATES)
    expect(templates.map((t) => t.info.id).sort()).toEqual([
      'bericht',
      'essay',
      'manuskript',
      'monographie',
      'randnotizen',
      'zeitschrift',
    ])
    const thesis = templates.find((t) => t.info.id === 'monographie')!
    expect(thesis.files.map((f) => f.path).sort()).toEqual([
      'lib.typ',
      'marginalia.typ',
      'style.toml',
    ])
    expect(thesis.files.find((f) => f.path === 'lib.typ')!.content).toContain('#import "style.typ"')
    expect(thesis.info.options.map((o) => o.id)).toContain('chapter_new_page')
    expect(prelude).toContain('app-bibliography-title')
  })
  it('finds nothing in a folder that is not there', async () => {
    expect((await loadTemplates('/does/not/exist')).templates).toEqual([])
  })
})

describe('the warnings', () => {
  it('list a citation the bibliography has no work for, in its sheet and line', async () => {
    const { root, session } = await project({
      'a/eins.typ': '= Eins\n\nWie @smith2020 und @niemand zeigen.\n',
    })
    const run = exporter(session, root, null)
    expect((await run.info()).warnings.unknownCitations).toEqual([
      { sheet: 'a/eins.typ', line: 3, key: 'niemand' },
    ])
  })
})

describe('the warnings about images', () => {
  const PLACEHOLDER =
    '#figure(\n  rect(width: 100%, height: 6cm),\n  caption: [Folgt],\n) <fig-k4x9tm>'

  it('list a figure whose image is not chosen yet, in its sheet and line', async () => {
    const { root, session } = await project({
      'a/eins.typ': `= Eins\n\n${PLACEHOLDER}\n\n#figure(image("assets/bild.png"), caption: [Da]) <fig-da>\n`,
    })
    const run = exporter(session, root, null)
    expect((await run.info()).warnings.emptyImages).toEqual([{ sheet: 'a/eins.typ', line: 3 }])
  })
})

describe('the preview', () => {
  /** A compiler that makes `pages` page images, or none, after `ms`. */
  function fakeCompiler(
    options: { pages?: number; ms?: number; code?: number; output?: string } = {},
  ): {
    compiler: Compiler
    calls: number[]
  } {
    const calls: number[] = []
    const compiler: Compiler = async (cwd, o) => {
      calls.push(calls.length + 1)
      expect(o?.preview).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, options.ms ?? 0))
      if (o?.signal?.aborted) return { code: null, output: '' }
      for (let i = 1; i <= (options.pages ?? 3); i += 1)
        await writeFile(join(cwd, '_build', 'preview', `p-${i}.png`), PNG)
      return { code: options.code ?? 0, output: options.output ?? '' }
    }
    return { compiler, calls }
  }
  const withCompiler = (session: ProjectSession, root: string, compiler: Compiler) =>
    createExporter({
      host: { session: () => session, root } as unknown as ProjectHost,
      templatesDir: TEMPLATES,
      compiler,
      available: () => Promise.resolve(true),
      pickSavePath: () => Promise.resolve(null),
      log: () => undefined,
    })

  it('compiles the project into page images and says how many there are', async () => {
    const { root, session } = await project()
    const { compiler } = fakeCompiler({ pages: 4 })
    const result = await withCompiler(session, root, compiler).preview()
    expect(result).toMatchObject({ ok: true, pages: 4, diagnostics: [] })
    expect(result.ok && result.stamp).toMatch(/^\d+$/)
    // The sheets were prepared for it, like for an export.
    expect(await readFile(join(root, '_build', 'main.typ'), 'utf8')).toContain('project')
  })

  it('removes the pages of an earlier preview, so a shorter document keeps none of them', async () => {
    const { root, session } = await project()
    const run = withCompiler(session, root, fakeCompiler({ pages: 5 }).compiler)
    expect(await run.preview()).toMatchObject({ pages: 5 })
    const shorter = withCompiler(session, root, fakeCompiler({ pages: 2 }).compiler)
    expect(await shorter.preview()).toMatchObject({ pages: 2 })
  })

  it('reports what went wrong, with the sheet and line', async () => {
    const { root, session } = await project()
    const { compiler } = fakeCompiler({
      pages: 0,
      code: 1,
      output: 'error: unknown variable: foo\n  ┌─ _build/content/einleitung/einleitung.typ:3:1\n',
    })
    const result = await withCompiler(session, root, compiler).preview()
    expect(result).toMatchObject({ ok: false, reason: 'failed' })
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('lets a newer preview supersede one that is still running', async () => {
    const { root, session } = await project()
    let calls = 0
    const compiler: Compiler = async (cwd, o) => {
      calls += 1
      const mine = calls
      await new Promise((resolve) => setTimeout(resolve, mine === 1 ? 150 : 5))
      if (o?.signal?.aborted) return { code: null, output: '' }
      await writeFile(join(cwd, '_build', 'preview', 'p-1.png'), PNG)
      return { code: 0, output: '' }
    }
    const run = withCompiler(session, root, compiler)
    const first = run.preview()
    const second = run.preview()
    expect(await first).toMatchObject({ ok: false, reason: 'superseded' })
    expect(await second).toMatchObject({ ok: true, pages: 1 })
  })

  it('says so when there is no compiler', async () => {
    const { root, session } = await project()
    const run = createExporter({
      host: { session: () => session, root } as unknown as ProjectHost,
      templatesDir: TEMPLATES,
      compiler: fakeCompiler().compiler,
      available: () => Promise.resolve(false),
      pickSavePath: () => Promise.resolve(null),
      log: () => undefined,
    })
    expect(await run.preview()).toMatchObject({ ok: false, reason: 'no_compiler' })
  })
})

describe('the preview with a profile', () => {
  it('uses the profile it is given and not the saved one', async () => {
    const { root, session } = await project()
    let seen = ''
    const compiler: Compiler = async (cwd) => {
      seen = await readFile(join(cwd, '_build', 'main.typ'), 'utf8')
      await writeFile(join(cwd, '_build', 'preview', 'p-1.png'), PNG)
      return { code: 0, output: '' }
    }
    const run = createExporter({
      host: { session: () => session, root } as unknown as ProjectHost,
      templatesDir: TEMPLATES,
      compiler,
      available: () => Promise.resolve(true),
      pickSavePath: () => Promise.resolve(null),
      log: () => undefined,
    })
    const saved = session.exportProfile()
    await run.preview({ ...saved, template: 'essay', options: { author: 'Zed Zorn' } })
    expect(seen).toContain('author: "Zed Zorn"')
    // The saved profile is not touched by a preview.
    expect(session.exportProfile().template).toBe(saved.template)
  })

  it('is remembered as the first profile when it is saved', async () => {
    const { root, session } = await project()
    const run = exporter(session, root, null)
    await run.saveProfile({ ...session.exportProfile(), template: 'essay' })
    expect(session.exportProfile().template).toBe('essay')
  })
})

describe('the thumbnails', () => {
  /** A compiler that makes `pages` images, the n-th one with n bytes of padding so they can be told apart. */
  function pagesCompiler(pages: number, seen: { runs: number; options: unknown[] }): Compiler {
    return async (cwd, o) => {
      seen.runs += 1
      seen.options.push(o)
      for (let i = 1; i <= pages; i += 1)
        await writeFile(
          join(cwd, '_build', 'preview', `p-${i}.png`),
          Buffer.concat([PNG, Buffer.alloc(i)]),
        )
      return { code: 0, output: '' }
    }
  }
  const make = (compiler: Compiler, available = true) =>
    createExporter({
      host: {} as unknown as ProjectHost,
      templatesDir: TEMPLATES,
      compiler,
      available: () => Promise.resolve(available),
      pickSavePath: () => Promise.resolve(null),
      log: () => undefined,
    })

  it('are the last page, which is the text where a template has a title page and contents', async () => {
    const seen = { runs: 0, options: [] as unknown[] }
    const result = await make(pagesCompiler(3, seen)).thumbnail('monographie', 'de')
    expect(Buffer.from(result.png!, 'base64').length).toBe(PNG.length + 3)
    // Small, and not in the project's folder.
    expect(seen.options[0]).toMatchObject({ preview: true, ppi: 72 })
  })

  it('are made once for a template that did not change, and again for another language', async () => {
    const seen = { runs: 0, options: [] as unknown[] }
    const run = make(pagesCompiler(1, seen))
    await run.thumbnail('essay', 'de')
    await run.thumbnail('essay', 'de')
    expect(seen.runs).toBe(1)
    await run.thumbnail('essay', 'en')
    expect(seen.runs).toBe(2)
  })

  it('are nothing for an unknown template or without a compiler', async () => {
    const seen = { runs: 0, options: [] as unknown[] }
    expect(await make(pagesCompiler(1, seen)).thumbnail('gibt-es-nicht', 'de')).toEqual({
      png: null,
    })
    expect(await make(pagesCompiler(1, seen), false).thumbnail('essay', 'de')).toEqual({
      png: null,
    })
    expect(seen.runs).toBe(0)
  })

  it('are nothing when the compiler fails', async () => {
    const failing: Compiler = () => Promise.resolve({ code: 1, output: 'error' })
    expect(await make(failing).thumbnail('essay', 'de')).toEqual({ png: null })
  })
})

describe.skipIf(!installed)('the thumbnails with the real Typst compiler', () => {
  it('make a picture of a page for every bundled template', async () => {
    const run = createExporter({
      host: {} as unknown as ProjectHost,
      templatesDir: TEMPLATES,
      compiler: spawnCompiler(binary),
      available: () => Promise.resolve(true),
      pickSavePath: () => Promise.resolve(null),
      log: () => undefined,
    })
    for (const id of [
      'bericht',
      'essay',
      'manuskript',
      'monographie',
      'randnotizen',
      'zeitschrift',
    ]) {
      const { png } = await run.thumbnail(id, 'de')
      expect(png, id).not.toBeNull()
      expect(Buffer.from(png!, 'base64').subarray(1, 4).toString('latin1')).toBe('PNG')
    }
  })
})

describe.skipIf(!installed)('the preview with the real Typst compiler', () => {
  it('makes one PNG per page of the thesis, and fewer when it is shorter', async () => {
    const { root, session } = await project()
    const run = exporter(session, root, null)
    const result = await run.preview()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pages).toBeGreaterThanOrEqual(2) // title page, contents, chapters
    const first = await readFile(join(root, '_build', 'preview', 'p-1.png'))
    expect(first.subarray(1, 4).toString('latin1')).toBe('PNG')
    // Cancelling the compiler stops it without leaving the pages half-made.
    const again = run.preview()
    const newer = run.preview()
    expect((await again).ok).toBe(false)
    expect((await newer).ok).toBe(true)
  })
})

describe('countPages', () => {
  it('counts page objects and not the page tree', () => {
    const pdf = Buffer.from(
      '<< /Type /Pages >> << /Type /Page >> << /Type /Page>> << /Type /Pages /Kids [] >>',
    )
    expect(countPages(pdf)).toBe(2)
  })
})

describe.skipIf(!installed)('with the real Typst compiler', () => {
  it('prints the three kinds of quotation, with and without marks around block quotes', async () => {
    const quotes = [
      '= Zitate',
      '',
      '#quote(block: true, attribution: [Goethe, _Faust_])[Ein Motto, mit freier Quelle.] <epigraph>',
      '',
      'Davor #quote[inline] @smith2020[S. 3] danach.',
      '',
      '#quote(block: true, attribution: [@smith2020[S. 4]])[Mit Beleg als Quelle.]',
      '',
      '#quote(block: true, attribution: [@smith2020 @smith2020[S. 5]])[Zwei Belege.]',
      '',
      '#quote(block: true)[Ohne Quelle.]',
      '',
      '#quote(block: true, attribution: [Kant])[Mit freiem Text.]',
      '',
      '#quote(block: true)[Zwei Absätze.\n\nDer zweite.]',
    ].join('\n')
    const { root, session, target } = await project({ 'a/zitate.typ': quotes })
    // The setting that puts quotation marks around block quotes (the template draws them).
    expect((await session.setQuoteBlockMarks(true)).ok).toBe(true)
    const result = await exporter(session, root, target).run({
      profile: defaultProfile('apa-7'),
      dialogTitle: 'Speichern',
      filterName: 'PDF',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: true, path: target })
    // And without the setting.
    expect((await session.setQuoteBlockMarks(false)).ok).toBe(true)
    expect(
      await exporter(session, root, target).run({
        profile: defaultProfile('apa-7'),
        dialogTitle: 'Speichern',
        filterName: 'PDF',
        fileName: 'x.pdf',
      }),
    ).toMatchObject({ ok: true })
  })

  it('prints a figure without an image as an empty frame, numbered with the others', async () => {
    const { root, session, target } = await project({
      'a/eins.typ': `= Eins\n\n#figure(\n  rect(width: 100%, height: 6cm),\n  caption: [Folgt],\n) <fig-k4x9tm>\n\nSiehe @fig-k4x9tm.\n`,
    })
    const result = await exporter(session, root, target).run({
      profile: defaultProfile('apa-7'),
      dialogTitle: 'Speichern',
      filterName: 'PDF',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: true, path: target })
  })

  it('exports the whole project to a PDF where it was asked to, and reports what is open', async () => {
    const { root, session, target } = await project()
    const run = exporter(session, root, target)
    const info = await run.info()
    expect(info.compiler).toBe(true)
    expect(info.warnings).toMatchObject({ comments: 1, highlights: 1 })
    expect(info.warnings.references).toEqual([])
    expect(info.warnings.unknownCitations).toEqual([])
    const result = await run.run({
      profile: { ...defaultProfile('apa-7'), options: { author: 'A. Autor' } },
      dialogTitle: 'Speichern',
      filterName: 'PDF',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: true, path: target })
    if (!result.ok) return
    const pdf = await readFile(target)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    // Title page, contents, and the chapters.
    expect(result.pages).toBeGreaterThanOrEqual(4)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    // The profile is kept in the project.
    expect(await readFile(join(root, 'project.toml'), 'utf8')).toContain('author = "A. Autor"')
    // The project's own sheets are as they were.
    expect(await readFile(join(root, 'content/einleitung/einleitung.typ'), 'utf8')).toBe(
      SHEETS['einleitung/einleitung.typ'],
    )
  }, 120_000)

  it('shows highlights and comments for a review, and still compiles', async () => {
    const { root, session, target } = await project()
    const result = await exporter(session, root, target).run({
      profile: { ...defaultProfile('chicago-author-date'), marks: 'show', comments: 'footnote' },
      dialogTitle: 'x',
      filterName: 'x',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: true })
    const main = await readFile(join(root, '_build/content/einleitung/einleitung.typ'), 'utf8')
    expect(main).toContain('#highlight[Markierung]')
    expect(main).toContain('#footnote[Das ist noch offen]')
  }, 120_000)

  it('says which sheet and line an error is in, and writes no PDF', async () => {
    const { root, session, target } = await project({
      'a/eins.typ': '= Eins\n\nAlles gut.\n',
      'a/zwei.typ': 'Eine Zeile.\n\nNoch eine #unbekannt(3) Zeile.\n',
    })
    const result = await exporter(session, root, target).run({
      profile: defaultProfile('apa-7'),
      dialogTitle: 'x',
      filterName: 'x',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: false, reason: 'failed' })
    if (result.ok) return
    const error = result.diagnostics.find((d) => d.severity === 'error')
    expect(error).toMatchObject({ sheet: 'a/zwei.typ', line: 3 })
    expect(error!.message).toMatch(/unknown variable/)
    await expect(readFile(target)).rejects.toThrow()
  }, 120_000)

  it('reports a reference to a heading that is not there before it compiles, and in the error', async () => {
    const { root, session, target } = await project({
      'a/eins.typ': '= Eins <sec-eins>\n\nSiehe @sec-fehlt.\n',
    })
    const run = exporter(session, root, target)
    expect((await run.info()).warnings.references).toEqual([
      { sheet: 'a/eins.typ', line: 3, label: 'sec-fehlt' },
    ])
    const result = await run.run({
      profile: defaultProfile('apa-7'),
      dialogTitle: 'x',
      filterName: 'x',
      fileName: 'x.pdf',
    })
    expect(result).toMatchObject({ ok: false })
  }, 120_000)

  it('does nothing when the save dialog is cancelled', async () => {
    const { root, session } = await project()
    const result = await exporter(session, root, null).run({
      profile: defaultProfile('apa-7'),
      dialogTitle: 'x',
      filterName: 'x',
      fileName: 'x.pdf',
    })
    expect(result).toEqual({ ok: false, reason: 'cancelled', diagnostics: [] })
  })
})

/** A font file that is on the machine but is not one of the compiler's own. */
const SYSTEM_FONT = '/System/Library/Fonts/Supplemental/Georgia.ttf'

describe.skipIf(!installed || !existsSync(SYSTEM_FONT))('fonts the writer added', () => {
  it('are found by the compiler only where it is told, and never from the system', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wm-fonts-'))
    try {
      await copyFile(SYSTEM_FONT, join(dir, 'Georgia.ttf'))
      expect(await listFontFamilies(binary, null)).not.toContain('Georgia')
      expect(await listFontFamilies(binary, dir)).toEqual(
        expect.arrayContaining(['Georgia', 'Libertinus Serif']),
      )

      await mkdir(join(dir, 'p', '_build'), { recursive: true })
      await writeFile(join(dir, 'p', '_build', 'main.typ'), '#set text(font: "Georgia")\nHallo\n')
      const compile = spawnCompiler(binary)
      const without = await compile(join(dir, 'p'))
      expect(without.output).toMatch(/unknown font family/i)
      const withFont = await compile(join(dir, 'p'), { fontPaths: [dir] })
      expect(withFont.output).not.toMatch(/unknown font family/i)
      expect(withFont.code).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
