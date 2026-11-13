import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadTemplates } from './exporter'
import { defaultProfile } from '@core/export/profile'
import { resolveOptions } from '@core/export/template'
import { MAIN_FILE } from '@core/export/build'
import { TITELEI_SLOTS } from '@core/project/paths'
import { ProjectSession } from '@core/project/session'
import { flattenSheets } from '@core/project/tree'
import { findTypst } from './mathRenderer'
import { createRootedFs } from './rootedFs'
import { EXAMPLE_LANGUAGES } from './exampleProject'

/**
 * The example project (`examples/<language>/`) is a showcase and a manual at once, and it has to
 * keep up with the app. These tests keep it honest: it opens without a problem, it compiles with
 * the templates that ship, both languages say the same, and every feature on the list below is
 * shown in it. A new feature goes on the list, and into the example, in the same change.
 */

const EXAMPLES = resolve('examples')
const TEMPLATES = resolve('templates')
const binary = findTypst({ override: process.env['EZETTA_TYPST'] })
const installed = binary !== 'typst'

/** What the example shows, by the source that shows it. */
const FEATURES: [name: string, pattern: RegExp][] = [
  ['a heading with a label', /^= .+ <sec-[a-z-]+>$/m],
  ['a sub-heading', /^== /m],
  ['emphasis and strong', /_[^_\n]+_[\s\S]*\*[^*\n]+\*/],
  ['a line break inside a paragraph', /\S \\\n\S/],
  ['small caps, subscript and superscript', /#smallcaps\[[\s\S]*#sub\[[\s\S]*#super\[/],
  ['a bullet list and a numbered one', /^- [\s\S]*^\+ /m],
  ['a link', /#link\("https:\/\/[^"]+"\)\[/],
  ['a divider', /^#divider\(\)$/m],
  ['a highlight', /::\S[^:\n]*\S::/],
  ['a comment', /\/\* [^*]+\*\//],
  ['a citation with a page', /@[a-z]+\d{4}\[[^\]]+\]/],
  ['a citation in the form of the sentence', /form: "prose"/],
  ['a citation of the year only', /form: "year"/],
  ['a citation of the author only', /form: "author"/],
  ['a group of citations', /@[a-z]+\d{4} @[a-z]+\d{4}/],
  ['a place that still needs a citation', /\/\*#cite-needed\*\//],
  ['a citation marked to check', /\/\*#check: [^*]+\*\//],
  ['a footnote', /#footnote\[/],
  ['a citation in a footnote', /#footnote\[[^\]]*@[a-z]+\d{4}/],
  ['a quotation in the text', /#quote\[/],
  ['a block quotation with its source', /#quote\(block: true, attribution: \[@/],
  ['an epigraph', /<epigraph>/],
  ['a figure with an image', /#figure\(\s*image\("assets\/[^"]+"/],
  ['a table', /table\.header/],
  ['a formula in the text', /\$[a-z] = \d+\$/],
  ['a numbered formula', /^\$ .+ \$ <eq-[a-z]+>$/m],
  [
    'cross-references to a figure, a table and a formula',
    /@fig-[a-z]+[\s\S]*@tbl-[a-z]+[\s\S]*@eq-[a-z]+/,
  ],
  ['source in the text', /`[^`\n]+`/],
]

let dir: string | null = null
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

/** A copy to open and export, so the checkout is never written into. */
async function copyOf(language: string): Promise<string> {
  dir ??= await mkdtemp(join(tmpdir(), 'wm-examples-'))
  const target = join(dir, language)
  await cp(join(EXAMPLES, language), target, { recursive: true })
  return target
}

async function open(root: string): Promise<ProjectSession> {
  const opened = await ProjectSession.open(createRootedFs(root, () => Promise.resolve()))
  if (!opened.ok) throw new Error(JSON.stringify(opened.error))
  return opened.value
}

async function sources(language: string): Promise<string> {
  const files: string[] = []
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(join(EXAMPLES, language, folder), { withFileTypes: true })) {
      const relative = join(folder, entry.name)
      if (entry.isDirectory()) await walk(relative)
      else if (entry.name.endsWith('.typ')) files.push(relative)
    }
  }
  await walk('')
  const texts = await Promise.all(
    files.sort().map((file) => readFile(join(EXAMPLES, language, file), 'utf8')),
  )
  return texts.join('\n\n')
}

describe('the example project', () => {
  it('has a folder for every language the app has', async () => {
    expect([...EXAMPLE_LANGUAGES].sort()).toEqual((await readdir(EXAMPLES)).sort())
  })

  for (const language of EXAMPLE_LANGUAGES) {
    describe(language, () => {
      it('opens without a problem: every file is listed, nothing is missing', async () => {
        const session = await open(await copyOf(language))
        const snapshot = session.snapshot()
        expect(snapshot.warnings).toEqual([])
        expect(snapshot.language).toBe(language)
        expect(snapshot.totalSheets).toBeGreaterThanOrEqual(10)
        // Every sheet has text; the status shows (draft, revised and final all occur).
        const sheets = flattenSheets(snapshot.tree).flatMap((row) =>
          row.node.kind === 'sheet' ? [row.node] : [],
        )
        expect(sheets.every((sheet) => sheet.words > 0)).toBe(true)
        expect(new Set(sheets.map((sheet) => sheet.status)).size).toBeGreaterThanOrEqual(2)
        // A scrapsheet and a folder of the material, which are there to be found.
        expect(sheets.some((sheet) => !sheet.export)).toBe(true)
        expect(snapshot.tree.children.some((child) => child.path === ':material')).toBe(true)
      })

      it('shows the Titelei: title, subtitle, authors, version and three texts', async () => {
        const { titelei } = (await open(await copyOf(language))).snapshot()
        expect(titelei.subtitle).not.toBe('')
        expect(titelei.version).not.toBe('')
        expect(titelei.authors.length).toBeGreaterThanOrEqual(2)
        expect(titelei.authors.every((a) => a.name !== '' && a.affiliation !== '')).toBe(true)
        expect(titelei.slots.abstract?.words).toBeGreaterThan(20)
        expect(titelei.slots.dedication?.words).toBeGreaterThan(0)
        // A slot is left empty, to show the dashed row.
        expect(TITELEI_SLOTS.filter((slot) => titelei.slots[slot] === null).length).toBeGreaterThan(
          0,
        )
      })

      for (const [name, pattern] of FEATURES)
        it(`shows ${name}`, async () => {
          expect(await sources(language)).toMatch(pattern)
        })

      it.skipIf(!installed)(
        'is exported with the bundled template, without an error and with the work cited',
        async () => {
          const root = await copyOf(language)
          const session = await open(root)
          const { templates, prelude } = await loadTemplates(TEMPLATES)
          const template = templates.find((t) => t.info.id === 'monographie')!
          const profile = {
            ...defaultProfile('apa-7'),
            options: resolveOptions(template.info, {}),
          }
          const built = await session.prepareExport(profile, template, prelude, { write: true })
          if (!built.ok) throw new Error(JSON.stringify(built.error))
          // Citations that the bibliography does not have, and marks that are meant to be open.
          expect(built.value.unknownCitations).toEqual([])
          expect(built.value.emptyImages).toEqual([])
          expect(built.value.problems).toEqual([])
          expect(built.value.noAuthors).toBe(false)
          expect(built.value.counts).toMatchObject({ missingCitations: 1, checks: 1 })
          expect(built.value.counts.comments).toBeGreaterThanOrEqual(1)
          execFileSync(
            binary,
            [
              'compile',
              '--root',
              root,
              '--ignore-system-fonts',
              '--font-path',
              resolve('templates', 'fonts'),
              MAIN_FILE,
              '_build/out.pdf',
            ],
            { cwd: root, stdio: 'pipe' },
          )
          const pdf = await readFile(join(root, '_build', 'out.pdf'))
          expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        },
      )

      // Every template sets the whole example: its margin notes, columns and figures included.
      it.skipIf(!installed).each(['zeitschrift', 'randnotizen', 'manuskript', 'essay', 'bericht'])(
        'is exported with %s too, without an error',
        async (id) => {
          const root = await copyOf(language)
          const session = await open(root)
          const { templates, prelude } = await loadTemplates(TEMPLATES)
          const template = templates.find((t) => t.info.id === id)!
          const profile = { ...defaultProfile('apa-7'), options: resolveOptions(template.info, {}) }
          const built = await session.prepareExport(profile, template, prelude, { write: true })
          if (!built.ok) throw new Error(JSON.stringify(built.error))
          execFileSync(
            binary,
            [
              'compile',
              '--root',
              root,
              '--ignore-system-fonts',
              '--font-path',
              resolve('templates', 'fonts'),
              MAIN_FILE,
              '_build/out.pdf',
            ],
            { cwd: root, stdio: 'pipe' },
          )
          const pdf = await readFile(join(root, '_build', 'out.pdf'))
          expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        },
      )
    })
  }

  it('says the same in both languages: the same files, groups, and number of each element', async () => {
    const shapes = await Promise.all(
      EXAMPLE_LANGUAGES.map(async (language) => {
        const snapshot = (await open(await copyOf(language))).snapshot()
        const sheets = flattenSheets(snapshot.tree).flatMap((row) =>
          row.node.kind === 'sheet' ? [row.node] : [],
        )
        const total = (pick: (s: (typeof sheets)[number]) => number): number =>
          sheets.reduce((sum, sheet) => sum + pick(sheet), 0)
        return {
          sheets: sheets.length,
          groups: snapshot.tree.children.filter((c) => c.kind === 'group').length,
          statuses: sheets.map((s) => `${s.status}${s.export ? '' : ' scrap'}`),
          footnotes: total((s) => s.footnotes),
          figures: total((s) => s.figures),
          tables: total((s) => s.tables),
          citations: total((s) => s.citations.length),
          targets: total((s) => s.targets.length),
          slots: TITELEI_SLOTS.map((slot) => snapshot.titelei.slots[slot] !== null),
          authors: snapshot.titelei.authors.length,
        }
      }),
    )
    expect(shapes[0]).toEqual(shapes[1])
  })
})
