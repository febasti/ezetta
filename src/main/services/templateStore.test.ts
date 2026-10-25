import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMBEDDED_FONTS } from '@core/export/elements'
import { parseStyle } from '@core/export/style'
import { loadTemplates } from './exporter'
import { listZip } from './unzip'
import { writeZip } from './zip'
import { createTemplateStore } from './templateStore'

const BUNDLED = resolve('templates')

let dir: string
let trashed: string[]
let picked: string[]
let savePath: string | null
let templateFile: string | null
const store = () =>
  createTemplateStore({
    bundledDir: BUNDLED,
    customDir: join(dir, 'templates'),
    trash: async (path) => {
      trashed.push(path)
      await rm(path, { recursive: true })
    },
    pickFonts: async () => picked,
    pickSavePath: async () => savePath,
    pickTemplateFile: async () => templateFile,
    // The compiler names families; here a file named Foo.ttf stands for the family Foo.
    families: async (fontsDir) => [
      ...EMBEDDED_FONTS,
      ...(fontsDir ? (await readdir(fontsDir)).map((f) => f.replace(/\.[a-z]+$/, '')) : []),
    ],
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wm-templates-'))
  trashed = []
  picked = []
  savePath = join(dir, 'out.ezetta-template')
  templateFile = null
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('the writer’s own templates', () => {
  it('lists the bundled templates as read-only', async () => {
    const list = await store().list()
    expect(list.map((t) => t.id).sort()).toEqual([
      'bericht',
      'essay',
      'manuskript',
      'monographie',
      'randnotizen',
      'zeitschrift',
    ])
    expect(list.every((t) => t.builtin && t.base === null)).toBe(true)
  })

  it('makes a copy of a template with a name of its own, and keeps nothing of the base on disk but its name', async () => {
    const id = await store().create('essay', 'Meine Fassung')
    expect(id).toBe('meine-fassung')
    expect(await readdir(join(dir, 'templates', id))).toEqual(['custom.toml', 'style.toml'])
    const list = await store().list()
    expect(list.find((t) => t.id === id)).toMatchObject({
      name: { de: 'Meine Fassung', en: 'Meine Fassung' },
      builtin: false,
      base: 'essay',
    })
  })

  it('gives each copy its own id', async () => {
    const a = await store().create('essay', 'Kopie')
    const b = await store().create('essay', 'Kopie')
    expect([a, b]).toEqual(['kopie', 'kopie-2'])
  })

  it('refuses a name with nothing in it and a base that does not exist', async () => {
    await expect(store().create('essay', '   ')).rejects.toMatchObject({ code: 'invalid_name' })
    await expect(store().create('nope', 'X')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('changes a value and takes it back to the base’s', async () => {
    const id = await store().create('essay', 'Meine')
    const overrides = await store().set(id, 'heading_2', 'size', '2em')
    expect(overrides).toEqual({ heading_2: { size: '2em' } })
    const detail = await store().get(id)
    expect(detail.overrides).toEqual({ heading_2: { size: '2em' } })
    expect(detail.baseSets['heading_2']).toMatchObject({ size: '1.15em' })
    expect(await store().set(id, 'heading_2', 'size', null)).toEqual({})
    expect(await readFile(join(dir, 'templates', id, 'style.toml'), 'utf8')).not.toContain(
      'heading_2',
    )
  })

  it('keeps every value when several are changed at once', async () => {
    const id = await store().create('essay', 'Meine')
    const s = store()
    await Promise.all(
      ['0.5pt', '1pt', '2pt', '3pt', '4pt'].map((value, i) =>
        s.set(id, `heading_${(i % 4) + 1}`, i < 4 ? 'size' : 'above', value),
      ),
    )
    await Promise.all([
      s.set(id, 'body', 'size', '9pt'),
      s.set(id, 'body', 'font', 'New Computer Modern'),
      s.set(id, 'quote', 'size', '0.8em'),
    ])
    expect((await s.get(id)).overrides).toEqual({
      heading_1: { size: '0.5pt', above: '4pt' },
      heading_2: { size: '1pt' },
      heading_3: { size: '2pt' },
      heading_4: { size: '3pt' },
      body: { size: '9pt', font: 'New Computer Modern' },
      quote: { size: '0.8em' },
    })
  })

  it('refuses a value that is not valid, and a change to a bundled template', async () => {
    const id = await store().create('essay', 'Meine')
    await expect(store().set(id, 'body', 'size', '1em); #x(')).rejects.toMatchObject({
      code: 'invalid_request',
    })
    await expect(store().set('essay', 'body', 'size', '9pt')).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(store().rename('essay', 'X')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(store().remove('essay')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('renames, and removes to the trash', async () => {
    const id = await store().create('manuskript', 'Alt')
    await store().rename(id, 'Neu')
    expect((await store().list()).find((t) => t.id === id)?.name.de).toBe('Neu')
    await store().remove(id)
    expect(trashed).toEqual([join(dir, 'templates', id)])
    expect((await store().list()).some((t) => t.id === id)).toBe(false)
  })

  it('copies a copy from the bundled template with the values changed so far', async () => {
    const first = await store().create('essay', 'Erste')
    await store().set(first, 'body', 'size', '9pt')
    const second = await store().create(first, 'Zweite')
    const detail = await store().get(second)
    expect(detail.base).toBe('essay')
    expect(detail.overrides).toEqual({ body: { size: '9pt' } })
  })

  it('exports with the base’s values and the writer’s on top', async () => {
    const id = await store().create('essay', 'Meine')
    await store().set(id, 'body', 'size', '9pt')
    const { templates } = await loadTemplates(BUNDLED, join(dir, 'templates'))
    const template = templates.find((t) => t.info.id === id)!
    expect(template.info.options.map((o) => o.id)).toContain('line_spacing')
    const style = parseStyle(template.files.find((f) => f.path === 'style.toml')!.content).style
    expect(style['body']!['size']).toBe('9pt')
    expect(style['body']!['font']).toBe('Libertinus Serif')
    expect(template.files.some((f) => f.path === 'lib.typ')).toBe(true)
  })

  it('ignores folders that are not templates, ones whose id is not the folder’s name, and ones whose base is gone', async () => {
    const root = join(dir, 'templates')
    await mkdir(join(root, 'stray'), { recursive: true })
    await writeFile(join(root, 'stray', 'notes.txt'), 'x')
    await mkdir(join(root, 'liar'), { recursive: true })
    await writeFile(join(root, 'liar', 'custom.toml'), 'id = "other"\nname = "X"\nbase = "essay"')
    await mkdir(join(root, 'orphan'), { recursive: true })
    await writeFile(join(root, 'orphan', 'custom.toml'), 'id = "orphan"\nname = "X"\nbase = "gone"')
    await mkdir(join(root, 'essay'), { recursive: true })
    await writeFile(join(root, 'essay', 'custom.toml'), 'id = "essay"\nname = "X"\nbase = "essay"')
    const { templates } = await loadTemplates(BUNDLED, root)
    expect(templates.map((t) => t.info.id).sort()).toEqual([
      'bericht',
      'essay',
      'manuskript',
      'monographie',
      'randnotizen',
      'zeitschrift',
    ])
    expect(templates.find((t) => t.info.id === 'essay')!.custom).toBeNull()
  })

  describe('options', () => {
    it('shows the options of the base with its defaults', async () => {
      const id = await store().create('essay', 'Meine')
      const { options } = await store().get(id)
      const title = options.find((o) => o.id === 'title_page')!
      expect(title).toMatchObject({ default: false, baseDefault: false, hidden: false })
      expect((await store().get('monographie')).options.some((o) => o.id === 'author')).toBe(true)
    })

    it('changes a default and hides an option, in the template only', async () => {
      const id = await store().create('essay', 'Meine')
      await store().setOption(id, 'title_page', { default: true })
      const options = await store().setOption(id, 'author', { default: 'A. Autor', hidden: true })
      expect(options.find((o) => o.id === 'title_page')).toMatchObject({
        default: true,
        baseDefault: false,
      })
      expect(options.find((o) => o.id === 'author')).toMatchObject({
        default: 'A. Autor',
        hidden: true,
      })
      const { templates } = await loadTemplates(BUNDLED, join(dir, 'templates'))
      const mine = templates.find((t) => t.info.id === id)!
      expect(mine.info.options.find((o) => o.id === 'author')).toMatchObject({ hidden: true })
      const essay = templates.find((t) => t.info.id === 'essay')!
      expect(essay.info.options.find((o) => o.id === 'author')?.hidden).toBeUndefined()
      // Back to the base's.
      const back = await store().setOption(id, 'title_page', { default: null })
      expect(back.find((o) => o.id === 'title_page')).toMatchObject({ default: false })
    })

    it('refuses a value the option does not take, and an option the base does not have', async () => {
      const id = await store().create('essay', 'Meine')
      await expect(
        store().setOption(id, 'line_spacing', { default: 'huge' }),
      ).rejects.toMatchObject({
        code: 'invalid_request',
      })
      await expect(store().setOption(id, 'nope', { hidden: true })).rejects.toMatchObject({
        code: 'invalid_request',
      })
      await expect(store().setOption('essay', 'author', { hidden: true })).rejects.toMatchObject({
        code: 'forbidden',
      })
    })

    it('stay with a copy, a renamed template and a template file', async () => {
      const id = await store().create('essay', 'Meine')
      await store().setOption(id, 'line_spacing', { default: 'wide' })
      const copy = await store().create(id, 'Kopie')
      expect((await store().get(copy)).options.find((o) => o.id === 'line_spacing')).toMatchObject({
        default: 'wide',
      })
      await store().rename(id, 'Umbenannt')
      expect((await store().get(id)).options.find((o) => o.id === 'line_spacing')).toMatchObject({
        default: 'wide',
      })
      templateFile = (await store().exportFile(id, 't', 'f', 'x'))!
      const imported = (await store().importFile('t', 'f'))!
      expect(
        (await store().get(imported)).options.find((o) => o.id === 'line_spacing'),
      ).toMatchObject({
        default: 'wide',
      })
    })

    it('are cleaned when a template file comes in', async () => {
      await writeZip(
        join(dir, 'opts.ezetta-template'),
        await (async () => {
          const path = join(dir, 'opts.toml')
          await writeFile(
            path,
            'id = "x"\nname = "Optionen"\nbase = "essay"\n[options.line_spacing]\ndefault = "a9"\nhidden = true\n[options.nope]\nhidden = true\n[options.title_page]\ndefault = true',
          )
          return [{ name: 'x/custom.toml', path, mtime: Date.now() }]
        })(),
      )
      templateFile = join(dir, 'opts.ezetta-template')
      const id = (await store().importFile('t', 'f'))!
      const { options } = await store().get(id)
      expect(options.find((o) => o.id === 'line_spacing')).toMatchObject({
        default: 'normal',
        hidden: true,
      })
      expect(options.find((o) => o.id === 'title_page')).toMatchObject({ default: true })
      expect(options.some((o) => o.id === 'nope')).toBe(false)
    })
  })

  describe('fonts', () => {
    const fontsOf = (id: string) => readdir(join(dir, 'templates', id, 'fonts')).catch(() => [])

    it('copies font files into the template and lists the families', async () => {
      const id = await store().create('essay', 'Meine')
      await writeFile(join(dir, 'Lato.ttf'), 'not really a font')
      await writeFile(join(dir, 'Notes.txt'), 'x')
      picked = [join(dir, 'Lato.ttf'), join(dir, 'Notes.txt'), join(dir, 'missing.otf')]
      const result = await store().addFonts(id, 'Wählen', 'Schriften')
      expect(result.fonts).toEqual(['Lato.ttf'])
      expect(result.families).toEqual([...EMBEDDED_FONTS, 'Lato'])
      expect(await fontsOf(id)).toEqual(['Lato.ttf'])
      const detail = await store().get(id)
      expect(detail.fonts).toEqual(['Lato.ttf'])
      expect(detail.families).toContain('Lato')
    })

    it('does not overwrite a file of the same name', async () => {
      const id = await store().create('essay', 'Meine')
      await writeFile(join(dir, 'Lato.ttf'), 'one')
      picked = [join(dir, 'Lato.ttf')]
      await store().addFonts(id, 't', 'f')
      await writeFile(join(dir, 'Lato.ttf'), 'two')
      const result = await store().addFonts(id, 't', 'f')
      expect(result.fonts).toEqual(['Lato 2.ttf', 'Lato.ttf'])
      expect(await readFile(join(dir, 'templates', id, 'fonts', 'Lato.ttf'), 'utf8')).toBe('one')
    })

    it('tells the compiler where the fonts are, once there are some', async () => {
      const id = await store().create('essay', 'Meine')
      const before = await loadTemplates(BUNDLED, join(dir, 'templates'))
      expect(before.templates.find((t) => t.info.id === id)!.fontsDir).toBeNull()
      await writeFile(join(dir, 'Lato.otf'), 'x')
      picked = [join(dir, 'Lato.otf')]
      await store().addFonts(id, 't', 'f')
      const after = await loadTemplates(BUNDLED, join(dir, 'templates'))
      expect(after.templates.find((t) => t.info.id === id)!.fontsDir).toBe(
        join(dir, 'templates', id, 'fonts'),
      )
      expect(after.templates.find((t) => t.info.id === 'essay')!.fontsDir).toBeNull()
    })

    it('removes a font to the trash, and only a file the template has', async () => {
      const id = await store().create('essay', 'Meine')
      await writeFile(join(dir, 'Lato.ttf'), 'x')
      picked = [join(dir, 'Lato.ttf')]
      await store().addFonts(id, 't', 'f')
      await expect(store().removeFont(id, '../custom.toml')).rejects.toMatchObject({
        code: 'invalid_request',
      })
      await expect(store().removeFont(id, 'Other.ttf')).rejects.toMatchObject({ code: 'not_found' })
      const result = await store().removeFont(id, 'Lato.ttf')
      expect(result.fonts).toEqual([])
      expect(trashed).toEqual([join(dir, 'templates', id, 'fonts', 'Lato.ttf')])
    })

    it('does not add fonts to a bundled template', async () => {
      picked = [join(dir, 'Lato.ttf')]
      await expect(store().addFonts('essay', 't', 'f')).rejects.toMatchObject({
        code: 'forbidden',
      })
    })

    it('shows a bundled template the families the compiler brings', async () => {
      expect((await store().get('essay')).families).toEqual([...EMBEDDED_FONTS])
    })
  })

  describe('template files', () => {
    const fileOf = (name: string) => join(dir, name)

    it('writes the template with its styles and fonts as one file', async () => {
      const id = await store().create('essay', 'Meine')
      await store().set(id, 'body', 'size', '9pt')
      await writeFile(join(dir, 'Lato.ttf'), 'font data')
      picked = [join(dir, 'Lato.ttf')]
      await store().addFonts(id, 't', 'f')
      const path = await store().exportFile(id, 't', 'f', 'Meine.ezetta-template')
      expect(path).toBe(join(dir, 'out.ezetta-template'))
      const names = (await listZip(path!)).map((e) => e.name).sort()
      expect(names).toEqual([`${id}/custom.toml`, `${id}/fonts/Lato.ttf`, `${id}/style.toml`])
    })

    it('writes nothing when the writer cancels, and nothing of a bundled template', async () => {
      const id = await store().create('essay', 'Meine')
      savePath = null
      expect(await store().exportFile(id, 't', 'f', 'x')).toBeNull()
      savePath = join(dir, 'out.ezetta-template')
      await expect(store().exportFile('essay', 't', 'f', 'x')).rejects.toMatchObject({
        code: 'forbidden',
      })
      expect(await readdir(dir)).not.toContain('out.ezetta-template')
    })

    it('takes a template file back in as a template of its own, with its values and fonts', async () => {
      const id = await store().create('manuskript', 'Weitergegeben')
      await store().set(id, 'heading_1', 'size', '2.5em')
      await writeFile(join(dir, 'Lato.otf'), 'font data')
      picked = [join(dir, 'Lato.otf')]
      await store().addFonts(id, 't', 'f')
      templateFile = (await store().exportFile(id, 't', 'f', 'x'))!

      // On another machine the id is free; here it is not, and the copy gets its own.
      const imported = await store().importFile('t', 'f')
      expect(imported).toBe('weitergegeben-2')
      const detail = await store().get(imported!)
      expect(detail).toMatchObject({
        name: 'Weitergegeben',
        base: 'manuskript',
        overrides: { heading_1: { size: '2.5em' } },
        fonts: ['Lato.otf'],
      })
      expect(await readdir(join(dir, 'templates'))).not.toContainEqual(
        expect.stringContaining('.importing'),
      )
    })

    it('keeps only valid values and font files', async () => {
      await writeZip(
        fileOf('mixed.ezetta-template'),
        await files({
          'x/custom.toml': 'id = "x"\nname = "Gemischt"\nbase = "essay"',
          'x/style.toml':
            '[element.body]\nsize = "9pt"\nfont = "A\\" + panic()"\n[element.nope]\nx = "1"',
          'x/fonts/Good.ttf': 'ok',
          'x/fonts/notes.txt': 'not a font',
          'x/other.typ': '#panic()',
        }),
      )
      templateFile = fileOf('mixed.ezetta-template')
      const id = (await store().importFile('t', 'f'))!
      expect(id).toBe('gemischt')
      expect((await store().get(id)).overrides).toEqual({ body: { size: '9pt' } })
      expect(await readdir(join(dir, 'templates', id))).toEqual([
        'custom.toml',
        'fonts',
        'style.toml',
      ])
      expect(await readdir(join(dir, 'templates', id, 'fonts'))).toEqual(['Good.ttf'])
    })

    it('refuses a file that is not a template, one based on a template this app lacks, and a hostile one', async () => {
      await writeZip(fileOf('plain.zip'), await files({ 'a/readme.txt': 'hello' }))
      templateFile = fileOf('plain.zip')
      await expect(store().importFile('t', 'f')).rejects.toMatchObject({ code: 'invalid_request' })

      await writeFile(fileOf('garbage.ezetta-template'), 'not a zip at all')
      templateFile = fileOf('garbage.ezetta-template')
      await expect(store().importFile('t', 'f')).rejects.toMatchObject({ code: 'io' })

      await writeZip(
        fileOf('orphan.ezetta-template'),
        await files({ 'x/custom.toml': 'id = "x"\nname = "Waise"\nbase = "gone"' }),
      )
      templateFile = fileOf('orphan.ezetta-template')
      await expect(store().importFile('t', 'f')).rejects.toMatchObject({ code: 'not_found' })

      await writeZip(
        fileOf('hostile.ezetta-template'),
        await files({
          'x/custom.toml': 'id = "x"\nname = "Böse"\nbase = "essay"',
          '../../escaped.txt': 'x',
        }),
      )
      templateFile = fileOf('hostile.ezetta-template')
      await expect(store().importFile('t', 'f')).rejects.toMatchObject({ code: 'io' })
      expect(await readdir(dir)).not.toContain('escaped.txt')
      expect((await store().list()).map((t) => t.id).sort()).toEqual([
        'bericht',
        'essay',
        'manuskript',
        'monographie',
        'randnotizen',
        'zeitschrift',
      ])
    })

    it('does nothing when the writer cancels the import', async () => {
      templateFile = null
      expect(await store().importFile('t', 'f')).toBeNull()
    })

    /** Writes the contents to files in a scratch folder and returns the zip entries for them. */
    async function files(contents: Record<string, string>) {
      const scratch = await mkdtemp(join(dir, 'src-'))
      const entries = []
      let n = 0
      for (const [name, text] of Object.entries(contents)) {
        const path = join(scratch, `f${n++}`)
        await writeFile(path, text)
        entries.push({ name, path, mtime: Date.now() })
      }
      return entries
    }
  })
})
