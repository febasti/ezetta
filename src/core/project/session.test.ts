import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryFs } from '../testing/memoryFs'
import { MATERIAL } from './paths'
import { exportOrder, findNode } from './tree'
import type { GroupNode, SheetNode } from './tree'
import { ProjectSession } from './session'
import type { Outcome } from './session'
import { defaultProfile } from '../export/profile'
import { parseTemplate } from '../export/template'

const MANIFEST = `[project]
version = 1
title = "Test"
language = "de"

[order]
"" = ["einleitung", "methoden", "notizen"]
"methoden" = ["design.typ", "daten", "auswertung.typ"]

[items."methoden/design.typ"]
status = "revised"
goal = 1200

[items."notizen/ideen.typ"]
export = false
`

function project(): MemoryFs {
  return new MemoryFs({
    'project.toml': MANIFEST,
    'library.bib': '',
    'content/einleitung/einleitung.typ': '= Einleitung\n\nEin kurzer Text.',
    'content/methoden/design.typ': 'Design der Studie hier.',
    'content/methoden/auswertung.typ': 'Auswertung.',
    'content/methoden/daten/interviews.typ': 'Interviews mit zwölf Personen.',
    'content/methoden/daten/dokumente.typ': 'Dokumente.',
    'content/notizen/ideen.typ': 'Idee eins.',
  })
}

async function open(fs: MemoryFs): Promise<ProjectSession> {
  const result = await ProjectSession.open(fs)
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}

function expectOk<T>(result: Outcome<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`)
  return result.value
}

/** A bare template for the export tests. */
const TEMPLATE = (() => {
  const parsed = parseTemplate('[template]\nid = "monographie"')
  if (!parsed.ok) throw new Error(parsed.message)
  return { info: parsed.value, files: [{ path: 'lib.typ', content: '// lib' }] }
})()
const exportFiles = async (session: ProjectSession, write = true) =>
  expectOk(await session.prepareExport(defaultProfile('apa-7'), TEMPLATE, '// prelude', { write }))

const sheetPaths = (group: GroupNode): string[] =>
  group.children.flatMap((c) =>
    c.kind === 'group' ? sheetPaths(c) : c.kind === 'sheet' ? [c.path] : [],
  )

describe('open and create', () => {
  it('opens a project, with word counts and settings', async () => {
    const snap = (await open(project())).snapshot()
    expect(snap.title).toBe('Test')
    expect(snap.totalSheets).toBe(6)
    expect(snap.totalWords).toBe(16)
    expect(findNode(snap.tree, 'methoden/design.typ')).toMatchObject({
      status: 'revised',
      goal: 1200,
      words: 4,
    })
    expect(findNode(snap.tree, 'notizen/ideen.typ')).toMatchObject({ export: false })
  })

  it('reports a folder without project.toml and a broken manifest without touching it', async () => {
    expect(await ProjectSession.open(new MemoryFs())).toMatchObject({
      ok: false,
      error: { code: 'not_a_project' },
    })
    const fs = new MemoryFs({ 'project.toml': '[project\n' })
    expect(await ProjectSession.open(fs)).toMatchObject({
      ok: false,
      error: { code: 'manifest_invalid' },
    })
    expect(fs.files.get('project.toml')).toBe('[project\n')
    expect(fs.writes).toBe(0)
  })

  it('creates the skeleton of a new project and refuses an existing one', async () => {
    const fs = new MemoryFs()
    const session = expectOk(await ProjectSession.create(fs, 'Neu', 'de'))
    expect([...fs.files.keys()].sort()).toEqual(['dictionary.txt', 'library.bib', 'project.toml'])
    expect(fs.dirs.has('content') && fs.dirs.has('assets')).toBe(true)
    expect(session.snapshot().tree.children).toEqual([])
    expect(await ProjectSession.create(fs, 'Nochmal')).toMatchObject({
      ok: false,
      error: { code: 'already_a_project' },
    })
  })
})

describe('reading and writing sheets', () => {
  it('reads and writes atomically, and updates word counts', async () => {
    const fs = project()
    const session = await open(fs)
    expect(expectOk(await session.readSheet('methoden/design.typ'))).toBe('Design der Studie hier.')
    const stats = expectOk(
      await session.writeSheet('methoden/design.typ', 'Neu geschrieben, jetzt fünf Wörter.'),
    )
    expect(stats.words).toBe(5)
    expect(fs.files.get('content/methoden/design.typ')).toBe('Neu geschrieben, jetzt fünf Wörter.')
    expect(findNode(session.snapshot().tree, 'methoden/design.typ')).toMatchObject({ words: 5 })
  })

  it('reads several sheets in the order asked, leaving out invalid and missing ones', async () => {
    const session = await open(project())
    const result = expectOk(
      await session.readSheets([
        'methoden/design.typ',
        '../project.toml',
        'methoden',
        'nope.typ',
        'einleitung/einleitung.typ',
      ]),
    )
    expect(result.map((r) => r.path)).toEqual(['methoden/design.typ', 'einleitung/einleitung.typ'])
    expect(result[0]?.content).toBe('Design der Studie hier.')
  })

  it('refuses paths that escape or are not sheets', async () => {
    const session = await open(project())
    for (const path of [
      '../project.toml',
      '/etc/passwd',
      'methoden/../../x.typ',
      'methoden',
      'methoden/nope.typ',
      '',
      'a\\b.typ',
    ]) {
      expect(await session.readSheet(path), path).toMatchObject({ ok: false })
      expect(await session.writeSheet(path, 'x'), path).toMatchObject({ ok: false })
    }
  })

  it('reports a failed write as an error and keeps the old file', async () => {
    const fs = project()
    const session = await open(fs)
    fs.failWrite = (p) => p.endsWith('design.typ')
    expect(await session.writeSheet('methoden/design.typ', 'x')).toMatchObject({
      ok: false,
      error: { code: 'io' },
    })
    expect(fs.files.get('content/methoden/design.typ')).toBe('Design der Studie hier.')
  })
})

describe('structure operations', () => {
  let fs: MemoryFs
  let session: ProjectSession
  beforeEach(async () => {
    fs = project()
    session = await open(fs)
  })

  it('creates a sheet and a group, appended to the folder order and saved to the manifest', async () => {
    expect(expectOk(await session.createSheet('methoden', 'Neu'))).toEqual({
      path: 'methoden/Neu.typ',
    })
    expect(expectOk(await session.createGroup('', 'Anhang'))).toEqual({ path: 'Anhang' })
    expect(fs.files.has('content/methoden/Neu.typ')).toBe(true)
    expect(fs.dirs.has('content/Anhang')).toBe(true)
    const manifest = fs.files.get('project.toml')!
    expect(manifest).toContain('"Neu.typ"')
    const methoden = findNode(session.snapshot().tree, 'methoden') as GroupNode
    expect(methoden.children.at(-1)).toMatchObject({ kind: 'sheet', name: 'Neu' })
  })

  it('rejects bad and clashing names without changing anything', async () => {
    const before = fs.files.get('project.toml')
    for (const name of ['', '  ', 'a/b', 'a:b', '.hidden', 'x'.repeat(200)]) {
      expect(await session.createSheet('methoden', name), name).toMatchObject({
        ok: false,
        error: { code: 'invalid_name' },
      })
    }
    expect(await session.createSheet('methoden', 'DESIGN')).toMatchObject({
      ok: false,
      error: { code: 'exists' },
    })
    expect(await session.createGroup('methoden', 'design')).toMatchObject({
      ok: false,
      error: { code: 'exists' },
    })
    expect(await session.createSheet('nope', 'x')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    })
    expect(await session.createSheet('../x', 'x')).toMatchObject({
      ok: false,
      error: { code: 'invalid_path' },
    })
    expect(fs.files.get('project.toml')).toBe(before)
  })

  it('renames a sheet, keeping settings, position, and the file content', async () => {
    expect(expectOk(await session.rename('methoden/design.typ', 'Entwurf'))).toEqual({
      path: 'methoden/Entwurf.typ',
    })
    expect(fs.files.has('content/methoden/design.typ')).toBe(false)
    expect(fs.files.get('content/methoden/Entwurf.typ')).toBe('Design der Studie hier.')
    const methoden = findNode(session.snapshot().tree, 'methoden') as GroupNode
    expect(methoden.children[0]).toMatchObject({
      name: 'Entwurf',
      status: 'revised',
      goal: 1200,
      words: 4,
    })
  })

  it('renames a group and everything inside follows', async () => {
    expectOk(await session.rename('methoden', 'Verfahren'))
    const snap = session.snapshot()
    expect(sheetPaths(snap.tree)).toContain('Verfahren/daten/interviews.typ')
    expect(findNode(snap.tree, 'Verfahren/design.typ')).toMatchObject({ status: 'revised' })
    expect(snap.warnings.filter((w) => w.kind === 'missing')).toEqual([])
    expect(fs.files.get('project.toml')).not.toContain('methoden')
  })

  it('allows a case-only rename', async () => {
    expectOk(await session.rename('methoden/auswertung.typ', 'Auswertung'))
    expect(fs.files.has('content/methoden/Auswertung.typ')).toBe(true)
  })

  it('moves a sheet into another group at a position', async () => {
    expectOk(await session.move('methoden/design.typ', 'einleitung', 0))
    const einleitung = findNode(session.snapshot().tree, 'einleitung') as GroupNode
    expect(einleitung.children.map((c) => c.name)).toEqual(['design', 'einleitung'])
    expect(einleitung.children[0]).toMatchObject({ status: 'revised' })
    expect(fs.files.has('content/einleitung/design.typ')).toBe(true)
  })

  it('reorders without touching files', async () => {
    const writes = fs.writes
    expectOk(await session.move('methoden/auswertung.typ', 'methoden', 0))
    expect(
      (findNode(session.snapshot().tree, 'methoden') as GroupNode).children.map((c) => c.name),
    ).toEqual(['auswertung', 'design', 'daten'])
    expect(fs.writes).toBe(writes + 1) // the manifest only
  })

  it('keeps what the list shows of a sheet that is only reordered', async () => {
    const before = findNode(session.snapshot().tree, 'methoden/design.typ') as SheetNode
    expect(before.preview.length).toBeGreaterThan(0)
    expectOk(await session.move('methoden/design.typ', 'methoden', 2))
    const after = findNode(session.snapshot().tree, 'methoden/design.typ') as SheetNode
    expect(after.preview).toEqual(before.preview)
    expect(after.words).toBe(before.words)
  })

  it('keeps what the list shows of a sheet that moves to another group', async () => {
    const before = findNode(session.snapshot().tree, 'methoden/design.typ') as SheetNode
    expectOk(await session.move('methoden/design.typ', 'einleitung', 0))
    const after = findNode(session.snapshot().tree, 'einleitung/design.typ') as SheetNode
    expect(after.preview).toEqual(before.preview)
  })

  it('refuses to move a group into itself or onto a name clash', async () => {
    expect(await session.move('methoden', 'methoden/daten')).toMatchObject({
      ok: false,
      error: { code: 'invalid_move' },
    })
    expect(await session.move('methoden', 'methoden')).toMatchObject({
      ok: false,
      error: { code: 'invalid_move' },
    })
    fs.put('content/einleitung/design.typ', 'clash')
    await session.refresh(null)
    expect(await session.move('methoden/design.typ', 'einleitung')).toMatchObject({
      ok: false,
      error: { code: 'exists' },
    })
    expect(fs.files.get('content/methoden/design.typ')).toBe('Design der Studie hier.')
  })

  it('deletes to the trash only, and removes the entry and its settings', async () => {
    expectOk(await session.remove('methoden/design.typ'))
    expect(fs.trashed).toEqual(['content/methoden/design.typ'])
    expect(fs.files.has('content/methoden/design.typ')).toBe(false)
    expect(fs.files.get('project.toml')).not.toContain('design.typ')
    expectOk(await session.remove('methoden'))
    expect(fs.trashed).toContain('content/methoden')
    expect(sheetPaths(session.snapshot().tree)).toEqual([
      'einleitung/einleitung.typ',
      'notizen/ideen.typ',
    ])
  })

  it('sets status, goal, and the export flag, and omits defaults in the file', async () => {
    expectOk(await session.setItem('einleitung/einleitung.typ', { status: 'final', goal: 500 }))
    expectOk(await session.setItem('notizen/ideen.typ', { export: undefined }))
    const manifest = fs.files.get('project.toml')!
    expect(manifest).toContain('status = "final"')
    expect(manifest).not.toContain('export = false')
    expect(findNode(session.snapshot().tree, 'notizen/ideen.typ')).toMatchObject({ export: true })
  })

  it('sets and resets a folder icon, and a folder keeps it when it is renamed', async () => {
    expectOk(await session.setItem('notizen', { icon: 'flask' }))
    expect(fs.files.get('project.toml')).toContain('icon = "flask"')
    expect(findNode(session.snapshot().tree, 'notizen')).toMatchObject({ icon: 'flask' })
    expectOk(await session.rename('notizen', 'ideen'))
    expect(findNode(session.snapshot().tree, 'ideen')).toMatchObject({ icon: 'flask' })
    expectOk(await session.setItem('ideen', { icon: undefined }))
    expect(fs.files.get('project.toml')).not.toContain('icon')
  })

  it('a failing manifest write leaves the in-memory state unchanged', async () => {
    fs.failWrite = (p) => p === 'project.toml'
    expect(await session.setItem('einleitung/einleitung.typ', { status: 'final' })).toMatchObject({
      ok: false,
      error: { code: 'io' },
    })
    expect(findNode(session.snapshot().tree, 'einleitung/einleitung.typ')).toMatchObject({
      status: 'draft',
    })
  })

  it('serializes overlapping commands', async () => {
    const results = await Promise.all([
      session.createSheet('', 'A'),
      session.createSheet('', 'B'),
      session.createSheet('', 'C'),
      session.createSheet('', 'a'),
    ])
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false])
    expect(
      session
        .snapshot()
        .tree.children.slice(-3)
        .map((c) => c.name),
    ).toEqual(['A', 'B', 'C'])
  })
})

describe('project title', () => {
  it('renames the project in the manifest only, never on disk', async () => {
    const fs = project()
    const session = await open(fs)
    expectOk(await session.setProjectTitle('  Neuer Titel  '))
    expect(session.snapshot().title).toBe('Neuer Titel')
    expect(fs.files.get('project.toml')).toContain('title = "Neuer Titel"')
    expect(fs.files.has('content/einleitung/einleitung.typ')).toBe(true)
  })

  it('rejects empty, overlong, and multi-line titles', async () => {
    const session = await open(project())
    for (const title of ['', '   ', 'x'.repeat(201), 'a\nb']) {
      expect(await session.setProjectTitle(title), JSON.stringify(title)).toMatchObject({
        ok: false,
        error: { code: 'invalid_name' },
      })
    }
    expect(session.snapshot().title).toBe('Test')
  })
})

describe('adding images', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  const text = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))

  it('stores an image in assets/ under a safe name and returns its path', async () => {
    const fs = project()
    const session = await open(fs)
    expect(expectOk(await session.addAsset('Mein Foto (1).JPG', PNG))).toEqual({
      path: 'assets/Mein-Foto-1.png',
    })
    expect(fs.bytes.get('assets/Mein-Foto-1.png')).toEqual(PNG)
  })

  it('never overwrites: the same name gets a number', async () => {
    const fs = project()
    const session = await open(fs)
    const first = expectOk(await session.addAsset('a.png', PNG))
    const second = expectOk(await session.addAsset('A.png', Uint8Array.from([...PNG, 9])))
    expect([first.path, second.path]).toEqual(['assets/a.png', 'assets/A-2.png'])
    expect(fs.bytes.get('assets/a.png')).toEqual(PNG)
  })

  it('refuses files that are not images by their content, whatever they are called', async () => {
    const fs = project()
    const session = await open(fs)
    expect(await session.addAsset('bild.png', text('Das ist Text.'))).toMatchObject({
      ok: false,
      error: { code: 'not_an_image' },
    })
    expect(await session.addAsset('x.png', new Uint8Array())).toMatchObject({
      ok: false,
      error: { code: 'not_an_image' },
    })
    expect(fs.bytes.size).toBe(0)
  })

  it('refuses huge files, and reports a failed write', async () => {
    const fs = project()
    const session = await open(fs)
    const huge = new Uint8Array(30 * 1024 * 1024 + 1)
    huge.set(PNG)
    expect(await session.addAsset('x.png', huge)).toMatchObject({
      ok: false,
      error: { code: 'too_large' },
    })
    fs.failWrite = (p) => p.startsWith('assets/')
    expect(await session.addAsset('x.png', PNG)).toMatchObject({ ok: false, error: { code: 'io' } })
  })

  it('sheets report their figure counts', async () => {
    const fs = project()
    fs.put(
      'content/methoden/design.typ',
      '#figure(image("assets/a.png"), caption: [x])\n\n#figure(image("assets/b.png"))\n\n#image("assets/c.png")',
    )
    const session = await open(fs)
    expect(findNode(session.snapshot().tree, 'methoden/design.typ')).toMatchObject({ figures: 2 })
  })
})

describe('the bibliography', () => {
  const BIB = '@book{smith2020, author = {Smith, John}, title = {Ein Buch}, year = {2020}}'

  it('is read when the project opens, and reread when its file changes', async () => {
    const fs = project()
    fs.files.set('library.bib', BIB)
    const session = await open(fs)
    expect(session.library().entries.map((e) => e.key)).toEqual(['smith2020'])
    const stamp = session.snapshot().bibliographyStamp
    expect(stamp).not.toBe('')

    // An unrelated change does not read it again, and a change to the file does.
    await session.refresh(['content/methoden/design.typ'])
    expect(session.snapshot().bibliographyStamp).toBe(stamp)
    fs.files.set('library.bib', `${BIB}\n@book{jones2019, title = {Zwei}}`)
    await session.refresh(['library.bib'])
    expect(session.library().entries.map((e) => e.key)).toEqual(['smith2020', 'jones2019'])
    expect(session.snapshot().bibliographyStamp).not.toBe(stamp)
  })

  it('can be a file outside the project: read where it is, never copied, handed to the export', async () => {
    const fs = project()
    fs.files.set('/home/me/zotero/library.bib', BIB)
    const session = await open(fs)
    expectOk(await session.setBibliography('/home/me/zotero/library.bib'))
    expect(session.snapshot().bibliographyPath).toBe('/home/me/zotero/library.bib')
    expect(session.library().entries.map((e) => e.key)).toEqual(['smith2020'])
    expect(session.externalBibliography()).toBe('/home/me/zotero/library.bib')
    expect(fs.files.get('project.toml')).toContain('bibliography = "/home/me/zotero/library.bib"')
    expect([...fs.files.keys()].filter((k) => k.endsWith('.bib')).sort()).toEqual([
      '/home/me/zotero/library.bib',
      'library.bib',
    ])

    // The program that writes the file changes it: the change is reported by its absolute path.
    fs.files.set('/home/me/zotero/library.bib', `${BIB}\n@book{jones2019, title = {Zwei}}`)
    await session.refresh(['/home/me/zotero/library.bib'])
    expect(session.library().entries).toHaveLength(2)

    // The compiler may only read inside the project, so the export gets a copy in _build: a clean
    // one, with the works that are cited.
    fs.files.set('content/einleitung/einleitung.typ', '= Einleitung\n\nWie @smith2020 zeigt.')
    const built = await exportFiles(session)
    expect(built.files.find((f) => f.path === '_build/main.typ')!.content).toContain(
      '#bibliography("/_build/bibliography.bib"',
    )
    expect(fs.files.get('_build/bibliography.bib')).toContain('smith2020')
    expect(fs.files.get('_build/bibliography.bib')).not.toContain('jones2019')
    // The writer's own file is not changed.
    expect(fs.files.get('/home/me/zotero/library.bib')).toContain('jones2019')
  })

  it('takes a file inside the project by its relative path, and refuses what is not BibTeX', async () => {
    const fs = project()
    fs.files.set('refs/mine.bib', BIB)
    fs.files.set('notes.txt', 'x')
    const session = await open(fs)
    expectOk(await session.setBibliography('refs/mine.bib'))
    expect(session.externalBibliography()).toBeNull()
    expect(session.library().entries).toHaveLength(1)
    expect(await session.setBibliography('notes.txt')).toMatchObject({
      ok: false,
      error: { code: 'not_a_bibliography' },
    })
    expect(await session.setBibliography('missing.bib')).toMatchObject({ ok: false })
    expect(await session.setBibliography('../escape.bib')).toMatchObject({ ok: false })
    expect(session.snapshot().bibliographyPath).toBe('refs/mine.bib')
  })

  it('is an empty library when the file is empty or missing', async () => {
    const fs = project()
    const session = await open(fs)
    expect(session.library().entries).toEqual([])
    expect(session.snapshot().bibliographyStamp).toBe('')
    fs.files.delete('library.bib')
    await session.refresh(['library.bib'])
    expect(session.library()).toEqual({ entries: [], problems: [] })
  })

  it('reports what it could not read, and still loads the rest', async () => {
    const fs = project()
    fs.files.set('library.bib', `@book{a, title={x\n${BIB}`)
    const session = await open(fs)
    expect(session.library().problems.length).toBeGreaterThan(0)
  })
})

describe('quotation marks around block quotes', () => {
  it('is part of the snapshot, saved to the manifest, and given to the export', async () => {
    const fs = project()
    const session = await open(fs)
    expect(session.snapshot().quoteBlockMarks).toBe(false)
    expectOk(await session.setQuoteBlockMarks(true))
    expect(session.snapshot().quoteBlockMarks).toBe(true)
    expect(fs.files.get('project.toml')).toContain('block_marks = true')
    const main = (built: Awaited<ReturnType<typeof exportFiles>>) =>
      built.files.find((f) => f.path === '_build/main.typ')!.content
    expect(main(await exportFiles(session, false))).toContain('#set quote(quotes: true)')
    expectOk(await session.setQuoteBlockMarks(false))
    expect(fs.files.get('project.toml')).not.toContain('quotes')
    expect(main(await exportFiles(session, false))).not.toContain('#set quote')
  })
})

describe('footnote numbering setting', () => {
  it('is part of the snapshot and saved to the manifest', async () => {
    const fs = project()
    const session = await open(fs)
    expect(session.snapshot().footnoteRestart).toBe('continuous')
    expectOk(await session.setFootnoteRestart('chapter'))
    expect(session.snapshot().footnoteRestart).toBe('chapter')
    expect(fs.files.get('project.toml')).toContain('restart = "chapter"')
    expectOk(await session.setFootnoteRestart('continuous'))
    expect(fs.files.get('project.toml')).not.toContain('footnotes')
  })

  it('sheets report their footnote counts', async () => {
    const fs = project()
    fs.put('content/methoden/design.typ', 'A#footnote[x] B#footnote[y]\n\n= H\n\nC#footnote[z]')
    const session = await open(fs)
    expect(findNode(session.snapshot().tree, 'methoden/design.typ')).toMatchObject({
      footnotes: 3,
      footnotesAfterChapter: 1,
    })
  })
})

describe('external changes', () => {
  it('appends new files and keeps vanished ones as missing, never dropping entries', async () => {
    const fs = project()
    const session = await open(fs)
    fs.put('content/methoden/neu.typ', 'Neu von außen.')
    await fs.trash('content/methoden/design.typ')
    const { snapshot } = await session.refresh(null)
    const methoden = findNode(snapshot.tree, 'methoden') as GroupNode
    expect(methoden.children.map((c) => [c.kind, c.name])).toEqual([
      ['missing', 'design'],
      ['group', 'daten'],
      ['sheet', 'auswertung'],
      ['sheet', 'neu'],
    ])
    expect(snapshot.warnings).toContainEqual({ kind: 'missing', path: 'methoden/design.typ' })
    expect(snapshot.warnings).toContainEqual({ kind: 'unlisted', path: 'methoden/neu.typ' })
    // The manifest was not rewritten by reconciling.
    expect(fs.files.get('project.toml')).toBe(MANIFEST)
  })

  it('reports sheets that changed on disk behind the app, but not its own writes', async () => {
    const fs = project()
    const session = await open(fs)
    await session.writeSheet('methoden/design.typ', 'Eigene Änderung.')
    expect((await session.refresh(['content/methoden/design.typ'])).externallyChanged).toEqual([])
    fs.put('content/methoden/design.typ', 'Fremde Änderung.')
    const result = await session.refresh(['content/methoden/design.typ'])
    expect(result.externallyChanged).toEqual(['methoden/design.typ'])
    expect(findNode(result.snapshot.tree, 'methoden/design.typ')).toMatchObject({ words: 2 })
  })

  it('treats an external rename as a missing entry plus a new file, and relink repairs it', async () => {
    const fs = project()
    const session = await open(fs)
    await fs.rename('content/methoden/design.typ', 'content/methoden/entwurf.typ')
    const { snapshot } = await session.refresh(null)
    expect(snapshot.warnings).toContainEqual({ kind: 'missing', path: 'methoden/design.typ' })
    expect(snapshot.warnings).toContainEqual({ kind: 'unlisted', path: 'methoden/entwurf.typ' })
    expectOk(await session.relink('methoden/design.typ', 'methoden/entwurf.typ'))
    const after = session.snapshot()
    expect(after.warnings.filter((w) => w.kind === 'missing')).toEqual([])
    const methoden = findNode(after.tree, 'methoden') as GroupNode
    expect(methoden.children[0]).toMatchObject({ name: 'entwurf', status: 'revised', goal: 1200 })
  })

  it('removes a missing entry on request', async () => {
    const fs = project()
    const session = await open(fs)
    await fs.trash('content/methoden/design.typ')
    await session.refresh(null)
    expectOk(await session.removeMissing('methoden/design.typ'))
    expect(session.snapshot().warnings.filter((w) => w.kind === 'missing')).toEqual([])
    expect(fs.files.get('project.toml')).not.toContain('design.typ')
    expect(await session.removeMissing('methoden/auswertung.typ')).toMatchObject({ ok: false })
  })

  it('refuses to write while project.toml on disk is broken, and recovers when fixed', async () => {
    const fs = project()
    const session = await open(fs)
    fs.put('project.toml', '[project\n')
    const broken = await session.refresh(['project.toml'])
    expect(broken.snapshot.warnings.some((w) => w.kind === 'manifest')).toBe(true)
    expect(await session.createSheet('', 'X')).toMatchObject({
      ok: false,
      error: { code: 'manifest_invalid' },
    })
    expect(fs.files.get('project.toml')).toBe('[project\n')
    fs.put('project.toml', MANIFEST)
    await session.refresh(['project.toml'])
    expectOk(await session.createSheet('', 'X'))
  })

  it('picks up manifest edits made outside the app', async () => {
    const fs = project()
    const session = await open(fs)
    fs.put(
      'project.toml',
      MANIFEST.replace(
        '"einleitung", "methoden", "notizen"',
        '"notizen", "methoden", "einleitung"',
      ),
    )
    const { snapshot } = await session.refresh(['project.toml'])
    expect(snapshot.tree.children.map((c) => c.name)).toEqual(['notizen', 'methoden', 'einleitung'])
  })
})

describe('export', () => {
  it('writes the main file, the template, and the preprocessed sheets in export order', async () => {
    const fs = project()
    const session = await open(fs)
    const built = await exportFiles(session)
    const main = fs.files.get(built.main)!
    expect(main).toContain('#include "content/einleitung/einleitung.typ"')
    expect(main).not.toContain('notizen')
    expect(fs.files.get('_build/content/einleitung/einleitung.typ')).toBe(
      '= Einleitung\n\nEin kurzer Text.',
    )
    expect(fs.files.get('_build/template/lib.typ')).toBe('// lib')
    expect(fs.files.get('_build/prelude.typ')).toBe('// prelude')
  })

  it('declares a bibliography only where something is cited, and writes nothing on a dry run', async () => {
    const fs = project()
    fs.files.set(
      'library.bib',
      '@book{smith2020, author = {Smith, John}, title = {S}, year = {2020}}',
    )
    const session = await open(fs)
    const without = await exportFiles(session, false)
    expect(without.files.find((f) => f.path === '_build/main.typ')!.content).not.toContain(
      '#bibliography',
    )
    expect(fs.files.has('_build/main.typ')).toBe(false)
    fs.files.set('content/methoden/design.typ', 'Wie @smith2020 zeigt.')
    const withCitation = await exportFiles(session, false)
    expect(withCitation.files.find((f) => f.path === '_build/main.typ')!.content).toContain(
      '#bibliography("/_build/bibliography.bib"',
    )
    expect(fs.files.has('_build/bibliography.bib')).toBe(false)
  })

  it('prints a citation of a work the bibliography does not have as a placeholder, and reports it', async () => {
    const fs = project()
    fs.files.set(
      'library.bib',
      '@book{smith2020, author = {Smith, John}, title = {S}, year = {2020}}',
    )
    fs.files.set(
      'content/methoden/design.typ',
      'Wie @smith2020 und @fehlt2000[S. 4] zeigen.#footnote[Auch #cite(<weg1999>).]',
    )
    const session = await open(fs)
    const built = await exportFiles(session)
    const copy = fs.files.get('_build/content/methoden/design.typ')!
    expect(copy).toContain('@smith2020')
    expect(copy).toContain('#text(fill: rgb("#c9473b"))[\\[fehlt2000?\\]]')
    expect(copy).toContain('#footnote[Auch #text(fill: rgb("#c9473b"))[\\[weg1999?\\]].]')
    expect(built.unknownCitations.map((c) => c.key)).toEqual(['fehlt2000', 'weg1999'])
  })

  it('remembers the profile in project.toml and gives it back', async () => {
    const fs = project()
    const session = await open(fs)
    expect(session.exportProfile()).toMatchObject({ template: 'monographie', marks: 'hide' })
    expectOk(
      await session.saveExportProfile({
        ...defaultProfile('chicago-notes'),
        name: 'Manuskript',
        marks: 'show',
        comments: 'footnote',
        options: { author: 'A. Autor', title_page: false },
      }),
    )
    expect(fs.files.get('project.toml')).toContain('[[export]]')
    const again = await open(fs)
    expect(again.exportProfile()).toEqual({
      name: 'Manuskript',
      template: 'monographie',
      citationStyle: 'chicago-notes',
      marks: 'show',
      comments: 'footnote',
      options: { author: 'A. Autor', title_page: false },
    })
  })
})

describe('sheets are never hidden from the tree by type', () => {
  it('shows only .typ files and ignores others', async () => {
    const fs = project()
    fs.put('content/methoden/readme.md', 'not a sheet')
    const session = await open(fs)
    expect(sheetPaths(session.snapshot().tree)).not.toContain('methoden/readme.md')
    const sheet = findNode(session.snapshot().tree, 'methoden/design.typ') as SheetNode
    expect(sheet.kind).toBe('sheet')
  })
})

describe('proofing', () => {
  it('keeps the settings in the manifest, and reports them in the snapshot', async () => {
    const fs = project()
    const session = await open(fs)
    expect(session.snapshot().proofing).toEqual({
      language: '',
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
    })
    expectOk(
      await session.setProofing({
        language: 'de-AT',
        level: 'picky',
        disabledRules: ['A', 'A', 'B'],
        disabledCategories: ['style'],
      }),
    )
    expect(session.snapshot().proofing).toEqual({
      language: 'de-AT',
      level: 'picky',
      disabledRules: ['A', 'B'],
      disabledCategories: ['style'],
    })
    expect(fs.files.get('project.toml')).toContain('disabled_categories')
    expectOk(await session.setProofing({ language: null }))
    expect(session.snapshot().proofing.language).toBe('')
  })

  it('adds words to the project dictionary once, one per line', async () => {
    const fs = project()
    const session = await open(fs)
    expectOk(await session.addDictionaryWord('Habitus'))
    expectOk(await session.addDictionaryWord('Habitus'))
    expectOk(await session.addDictionaryWord('Doxa'))
    expectOk(await session.addDictionaryWord('  '))
    expect(fs.files.get('dictionary.txt')).toBe('Habitus\nDoxa\n')
    expect(await session.readDictionary()).toBe('Habitus\nDoxa\n')
  })
})

describe('sheet names', () => {
  it('gives a new sheet a generated file name, and its first lines name it in the list', async () => {
    const fs = project()
    const session = await open(fs)
    const { path } = expectOk(await session.createSheet('methoden'))
    expect(path).toMatch(/^methoden\/s-[a-z0-9]{6}\.typ$/)
    expect(fs.files.get(`content/${path}`)).toBe('')
    expectOk(await session.writeSheet(path, '= Ergebnisse\n\nDie Zahlen zeigen es.\n'))
    const node = findNode(session.snapshot().tree, path) as SheetNode
    expect(node.title).toBe('Ergebnisse')
    expect(node.preview).toEqual([
      [1, 'Ergebnisse'],
      [0, 'Die Zahlen zeigen es.'],
    ])
  })

  it('never gives two sheets the same generated name', async () => {
    const session = await open(project())
    const paths = new Set<string>()
    for (let i = 0; i < 40; i += 1) paths.add(expectOk(await session.createSheet('')).path)
    expect(paths.size).toBe(40)
  })
})

describe('the material', () => {
  let fs: MemoryFs
  let session: ProjectSession
  beforeEach(async () => {
    fs = project()
    session = await open(fs)
  })

  it('does not exist before the first folder in it, and then stands beside the document', async () => {
    expect(findNode(session.snapshot().tree, MATERIAL)).toBeNull()
    expectOk(await session.createGroup(MATERIAL, 'Recherche'))
    expectOk(await session.createGroup(MATERIAL, 'Interviews'))
    const material = findNode(session.snapshot().tree, MATERIAL) as GroupNode
    expect(material.children.map((c) => c.path)).toEqual([
      `${MATERIAL}/Recherche`,
      `${MATERIAL}/Interviews`,
    ])
    // It is never in the export and counts for nothing in the document.
    expect(material.inExport).toBe(false)
    expect(session.snapshot().totalSheets).toBe(6)
  })

  it('takes a folder with its sheets and settings, and gives it back to the document', async () => {
    expectOk(await session.setItem('methoden/design.typ', { status: 'final' }))
    expectOk(await session.move('methoden', MATERIAL))
    const tree = session.snapshot().tree
    expect(findNode(tree, `${MATERIAL}/methoden/design.typ`)).toMatchObject({
      status: 'final',
      inExport: false,
      words: 4,
    })
    expect(findNode(tree, 'methoden')).toBeNull()
    expect(fs.files.has('material/methoden/design.typ')).toBe(true)
    expect(exportOrder(tree).map((s) => s.path)).toEqual(['einleitung/einleitung.typ'])
    // And back, into the document, with the settings.
    expectOk(await session.move(`${MATERIAL}/methoden`, ''))
    expect(findNode(session.snapshot().tree, 'methoden/design.typ')).toMatchObject({
      status: 'final',
      inExport: true,
    })
    expect(fs.files.has('content/methoden/design.typ')).toBe(true)
  })

  it('holds folders only, and the material itself cannot be moved, renamed or removed', async () => {
    expect(await session.move('einleitung/einleitung.typ', MATERIAL)).toMatchObject({
      ok: false,
      error: { code: 'invalid_move' },
    })
    expect(await session.createSheet(MATERIAL)).toMatchObject({ ok: false })
    expectOk(await session.createGroup(MATERIAL, 'Recherche'))
    expect(await session.move(MATERIAL, 'methoden')).toMatchObject({ ok: false })
    expect(await session.rename(MATERIAL, 'x')).toMatchObject({ ok: false })
    expect(await session.remove(MATERIAL)).toMatchObject({ ok: false })
    // Sheets can be made in a folder of the material, and folders nest in it.
    const inner = expectOk(await session.createGroup(`${MATERIAL}/Recherche`, 'Quellen'))
    expectOk(await session.createSheet(inner.path))
    expect(sheetPaths(findNode(session.snapshot().tree, MATERIAL) as GroupNode)).toHaveLength(1)
  })

  it('keeps the order of its folders, and refuses a name that is taken', async () => {
    expectOk(await session.createGroup(MATERIAL, 'A'))
    expectOk(await session.createGroup(MATERIAL, 'B'))
    expectOk(await session.move(`${MATERIAL}/B`, MATERIAL, 0))
    const names = () =>
      (findNode(session.snapshot().tree, MATERIAL) as GroupNode).children.map((c) => c.name)
    expect(names()).toEqual(['B', 'A'])
    expect(await session.createGroup(MATERIAL, 'a')).toMatchObject({
      ok: false,
      error: { code: 'exists' },
    })
    // A folder of the document with the name of one in the material cannot move in.
    expectOk(await session.createGroup('', 'A'))
    expect(await session.move('A', MATERIAL)).toMatchObject({
      ok: false,
      error: { code: 'exists' },
    })
  })

  it('moves a folder that was marked "not in the export" into the material when the project is opened', async () => {
    const old = project()
    old.files.set(
      'project.toml',
      MANIFEST.replace('[items."notizen/ideen.typ"]', '[items."notizen"]'),
    )
    const fresh = await open(old)
    const tree = fresh.snapshot().tree
    expect(findNode(tree, 'notizen')).toBeNull()
    expect(findNode(tree, `${MATERIAL}/notizen/ideen.typ`)).toMatchObject({ inExport: false })
    expect(old.files.has('material/notizen/ideen.typ')).toBe(true)
    // The mark is gone, so it is not done again, and the folder is where the manifest says.
    const manifest = old.files.get('project.toml')!
    expect(manifest).not.toContain('export = false')
    expect(manifest).toContain(MATERIAL)
  })
})
