import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupStatusDto } from '@shared/backup'
import type { ProjectChangedDto } from '@shared/project'
import { ProjectHost } from './projectHost'
import { SettingsStore } from './settings'

const fixture = resolve('tests/fixtures/sample-project')

let base: string
let projectDir: string
let onChange: ((paths: string[]) => void) | null
const events: ProjectChangedDto[] = []
const trashed: string[] = []
let pickedOpen: string | null
let pickedNew: string | null
let pickedBib: string | null = null
let pickedBackup: string | null = null
let pickedZip: string | null = null
let pickedRestoreTo: string | null = null
const externalWatched: string[][] = []

const backupEvents: BackupStatusDto[] = []
/** One store for the test, as the app has one for all projects (a host made later sees what an earlier one saved). */
let settings: SettingsStore

function makeHost(options: { versions?: boolean; backups?: boolean } = {}): ProjectHost {
  return new ProjectHost({
    backupCheckMs: options.backups ? 50 : 3_600_000,
    firstBackupDelayMs: options.backups ? 10 : 3_600_000,
    emitBackup: (status) => void backupEvents.push(status),
    // Versions are tested on their own below; elsewhere they stay out of the way.
    versionIntervalMs: options.versions ? 50 : 3_600_000,
    firstVersionDelayMs: options.versions ? 10 : 3_600_000,
    settings,
    trashItem: async (p) => void trashed.push(p),
    pickFolderToOpen: async () => pickedOpen,
    pickNewProjectPath: async () => pickedNew,
    pickImageFile: async () => null,
    pickBibliographyFile: async () => pickedBib,
    pickBackupFolder: async () => pickedBackup,
    pickBackupFile: async () => pickedZip,
    pickRestoreFolder: async () => pickedRestoreTo,
    emitChanged: (payload) => void events.push(payload),
    log: vi.fn(),
    watch: (_root, cb) => {
      onChange = cb
      return {
        setExternal: (paths) => void externalWatched.push([...paths]),
        close: async () => undefined,
      }
    },
  })
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'wm-host-')))
  projectDir = join(base, 'copy')
  await cp(fixture, projectDir, { recursive: true }) // never touch the fixture itself
  events.length = 0
  backupEvents.length = 0
  settings = new SettingsStore(join(base, 'userdata'))
  externalWatched.length = 0
  pickedBib = null
  trashed.length = 0
  onChange = null
  pickedOpen = projectDir
  pickedNew = join(base, 'Neues Projekt')
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('ProjectHost', () => {
  it('opens a project through the dialog and remembers it as recent', async () => {
    const host = makeHost()
    const snapshot = await host.pickAndOpen('Öffnen')
    expect(snapshot?.title).toBe('Beispielprojekt')
    expect(snapshot?.totalSheets).toBe(1)
    expect(host.root).toBe(projectDir)
  })

  it('returns null when the dialog is cancelled', async () => {
    pickedOpen = null
    pickedNew = null
    const host = makeHost()
    expect(await host.pickAndOpen('x')).toBeNull()
    expect(await host.pickAndCreate('de', 'x')).toBeNull()
    expect(host.root).toBeNull()
  })

  it('creates a project folder with the skeleton and the folder name as title', async () => {
    const host = makeHost()
    const snapshot = await host.pickAndCreate('de', 'Neu')
    expect(snapshot?.title).toBe('Neues Projekt')
    const manifest = await readFile(join(base, 'Neues Projekt', 'project.toml'), 'utf8')
    expect(manifest).toContain('title = "Neues Projekt"')
  })

  it('refuses a folder that is no project and a missing folder', async () => {
    const host = makeHost()
    await mkdir(join(base, 'empty'))
    await expect(host.openPath(join(base, 'empty'))).rejects.toMatchObject({
      code: 'not_a_project',
    })
    await expect(host.openPath(join(base, 'nope'))).rejects.toMatchObject({ code: 'not_found' })
  })

  it('requires an open project for session access', () => {
    expect(() => makeHost().session()).toThrowError(expect.objectContaining({ code: 'no_project' }))
  })

  it('pushes a change event for external edits but not for what it already reported', async () => {
    const host = makeHost()
    await host.openPath(projectDir)
    const session = host.session()
    await session.writeSheet('einleitung/einleitung.typ', 'Eigener Text.')
    host.snapshot() // as every handler does after a command
    onChange?.(['content/einleitung/einleitung.typ'])
    await vi.waitFor(() => expect(true).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(events).toHaveLength(0)

    await writeFile(
      join(projectDir, 'content', 'einleitung', 'einleitung.typ'),
      'Fremder Text, länger jetzt.',
    )
    onChange?.(['content/einleitung/einleitung.typ'])
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]!.externallyChanged).toEqual(['einleitung/einleitung.typ'])
    expect(events[0]!.snapshot.totalWords).toBe(4)
  })

  it('does not push events from a project that was closed or replaced', async () => {
    const host = makeHost()
    await host.openPath(projectDir)
    const stale = onChange!
    await host.close()
    await writeFile(join(projectDir, 'content', 'einleitung', 'neu.typ'), 'x')
    stale(['content/einleitung/neu.typ'])
    await new Promise((r) => setTimeout(r, 100))
    expect(events).toHaveLength(0)
  })

  it('deletes only to the trash through the session', async () => {
    const host = makeHost()
    await host.openPath(projectDir)
    await host.session().remove('einleitung/einleitung.typ')
    expect(trashed).toEqual([join(projectDir, 'content', 'einleitung', 'einleitung.typ')])
  })

  it('takes a bibliography file from outside the project where it is, and watches it', async () => {
    const host = makeHost()
    await host.pickAndOpen('Öffnen')
    const outside = join(base, 'zotero.bib')
    await writeFile(outside, '@book{smith2020, author={Smith, J}, title={T}, year={2020}}')
    pickedBib = outside
    const snapshot = await host.chooseBibliography('Wählen', 'BibTeX')
    expect(snapshot?.bibliographyPath).toBe(outside)
    expect(
      host
        .session()
        .library()
        .entries.map((e) => e.key),
    ).toEqual(['smith2020'])
    expect(externalWatched.at(-1)).toEqual([outside])
    // Nothing was copied into the project, and the file itself is untouched.
    expect(await readFile(outside, 'utf8')).toContain('smith2020')
    expect(await readFile(join(projectDir, 'project.toml'), 'utf8')).toContain(
      `bibliography = ${JSON.stringify(outside)}`,
    )
  })

  it('stores a bibliography file inside the project as a relative path, and watches nothing extra', async () => {
    const host = makeHost()
    await host.pickAndOpen('Öffnen')
    pickedBib = join(projectDir, 'refs.bib')
    await writeFile(pickedBib, '@book{a, title={T}}')
    const snapshot = await host.chooseBibliography('Wählen', 'BibTeX')
    expect(snapshot?.bibliographyPath).toBe('refs.bib')
    expect(externalWatched.at(-1)).toEqual([])
  })

  it('does nothing when the dialog is cancelled, and refuses a file that is not BibTeX', async () => {
    const host = makeHost()
    await host.pickAndOpen('Öffnen')
    pickedBib = null
    expect(await host.chooseBibliography('Wählen', 'BibTeX')).toBeNull()
    pickedBib = join(base, 'notes.txt')
    await writeFile(pickedBib, 'x')
    await expect(host.chooseBibliography('Wählen', 'BibTeX')).rejects.toMatchObject({
      code: 'not_a_bibliography',
    })
  })
})

describe('ProjectHost versions', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it('takes a version soon after opening, and when the project is closed', async () => {
    const host = makeHost({ versions: true })
    await host.pickAndOpen('x')
    await wait(400)
    const first = await host.versions()
    expect(first.enabled).toBe(true)
    expect(first.versions).toHaveLength(1)
    // A change is kept by the timer, and nothing is taken while nothing changes.
    await writeFile(join(projectDir, 'content', 'neu.typ'), '= Neu\n')
    await wait(400)
    expect((await host.versions()).versions).toHaveLength(2)
    await wait(200)
    expect((await host.versions()).versions).toHaveLength(2)
    // Closing keeps the last state.
    await writeFile(join(projectDir, 'content', 'noch.typ'), '= Noch\n')
    const closing = host.close()
    await closing
    const again = makeHost()
    await again.pickAndOpen('x')
    expect((await again.versions()).versions).toHaveLength(3)
  })

  it('brings a sheet back as it was, after saving the state it had', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    const path = 'content/neu.typ'
    await writeFile(join(projectDir, path), '= Alt\n\nAlter Text.\n')
    const saved = await host.takeVersion('named', 'Alter Stand')
    expect(saved).toMatchObject({ kind: 'named', name: 'Alter Stand' })
    await writeFile(join(projectDir, path), '= Neu\n\nNeuer Text.\n')
    const compare = await host.compareVersion(saved!.id, path)
    expect(compare).toMatchObject({
      version: '= Alt\n\nAlter Text.\n',
      current: '= Neu\n\nNeuer Text.\n',
      binary: false,
    })

    const snapshot = await host.restoreVersion(saved!.id, path)
    expect(await readFile(join(projectDir, path), 'utf8')).toBe('= Alt\n\nAlter Text.\n')
    expect(snapshot.title).toBe('Beispielprojekt')
    // The state before the restore is a version of its own, so the restore can be undone.
    const kinds = (await host.versions()).versions.map((v) => v.kind)
    expect(kinds).toContain('restore')
    const restoreVersion = (await host.versions()).versions.find((v) => v.kind === 'restore')!
    expect((await host.compareVersion(restoreVersion.id, path)).version).toBe(
      '= Neu\n\nNeuer Text.\n',
    )
  })

  it('brings back a sheet that was deleted', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    const path = 'content/weg.typ'
    await writeFile(join(projectDir, path), '= Weg\n')
    const saved = await host.takeVersion('named', 'Mit Blatt')
    await rm(join(projectDir, path))
    await host.restoreVersion(saved!.id, path)
    expect(await readFile(join(projectDir, path), 'utf8')).toBe('= Weg\n')
  })

  it('refuses a restore of a file the version does not have', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    const saved = await host.takeVersion('named', 'X')
    await expect(host.restoreVersion(saved!.id, 'content/gibt-es-nicht.typ')).rejects.toMatchObject(
      {
        code: 'not_found',
      },
    )
  })

  it('brings back a file that is not a sheet, an image without a change to its bytes', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255, 254])
    await mkdir(join(projectDir, 'assets'), { recursive: true })
    await writeFile(join(projectDir, 'assets', 'bild.png'), image)
    const saved = await host.takeVersion('named', 'Mit Bild')
    await writeFile(join(projectDir, 'assets', 'bild.png'), Buffer.from([1, 2, 3]))
    const files = await host.versionFiles(saved!.id)
    expect(files.files.map((f) => [f.path, f.change, f.binary])).toContainEqual([
      'assets/bild.png',
      'modified',
      true,
    ])
    expect(await host.compareVersion(saved!.id, 'assets/bild.png')).toEqual({
      version: null,
      current: null,
      binary: true,
      versionSize: image.length,
      currentSize: 3,
    })
    await host.restoreVersion(saved!.id, 'assets/bild.png')
    expect((await readFile(join(projectDir, 'assets', 'bild.png'))).equals(image)).toBe(true)
  })

  it('brings the whole project back to a version, and removes what is new only when asked', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    await writeFile(join(projectDir, 'content', 'eins.typ'), '= Eins alt\n')
    await writeFile(join(projectDir, 'content', 'zwei.typ'), '= Zwei alt\n')
    const saved = await host.takeVersion('named', 'Stand 1')
    await writeFile(join(projectDir, 'content', 'eins.typ'), '= Eins neu\n')
    await rm(join(projectDir, 'content', 'zwei.typ'))
    await writeFile(join(projectDir, 'content', 'drei.typ'), '= Drei neu\n')
    const files = await host.versionFiles(saved!.id)
    expect(files.newSince).toBe(1)

    const kept = await host.restoreAllFromVersion(saved!.id, false)
    expect(kept).toMatchObject({ restored: 2, removed: 0 })
    expect(await readFile(join(projectDir, 'content', 'eins.typ'), 'utf8')).toBe('= Eins alt\n')
    expect(await readFile(join(projectDir, 'content', 'zwei.typ'), 'utf8')).toBe('= Zwei alt\n')
    // Nothing was removed: the sheet that is new since is still there.
    expect(await readFile(join(projectDir, 'content', 'drei.typ'), 'utf8')).toBe('= Drei neu\n')
    expect(trashed).toEqual([])

    const exact = await host.restoreAllFromVersion(saved!.id, true)
    expect(exact).toMatchObject({ restored: 0, removed: 1 })
    expect(trashed).toEqual([join(projectDir, 'content', 'drei.typ')])
    // The state before the first restore is a version, so it can be undone.
    expect((await host.versions()).versions.some((v) => v.kind === 'restore')).toBe(true)
  })

  it('takes no versions while they are turned off, and keeps the setting in the project file', async () => {
    const host = makeHost({ versions: true })
    await host.pickAndOpen('x')
    const snapshot = await host.setHistoryEnabled(false)
    expect(snapshot.historyEnabled).toBe(false)
    expect(await readFile(join(projectDir, 'project.toml'), 'utf8')).toContain('enabled = false')
    await writeFile(join(projectDir, 'content', 'neu.typ'), '= Neu\n')
    expect(await host.takeVersion('auto')).toBeNull()
    expect(await host.takeVersion('named', 'Nein')).toBeNull()
    expect((await host.setHistoryEnabled(true)).historyEnabled).toBe(true)
    await wait(300)
    expect((await host.versions()).versions.length).toBeGreaterThan(0)
  })
})

describe('ProjectHost backup', () => {
  let folder: string
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  beforeEach(async () => {
    folder = join(base, 'Sicherung')
    await mkdir(folder)
  })

  it('is not set up until a folder is chosen, and says so', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    expect(await host.backupStatus()).toMatchObject({
      configured: false,
      folder: null,
      lastAt: null,
      running: false,
      error: null,
    })
  })

  it('makes the first backup when the folder is chosen, and reports its start and end', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = folder
    expect(await host.chooseBackupFolder('Sicherung')).toEqual({ chosen: true, problem: null })
    const status = await host.backupStatus()
    expect(status).toMatchObject({ configured: true, folder, reachable: true, running: false })
    expect(status.lastFile).toMatch(/^Beispielprojekt \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.zip$/)
    expect((await host.backups()).map((f) => f.name)).toEqual([status.lastFile])
    expect(backupEvents.map((e) => e.running)).toEqual([true, false])
    // The path of a backup is only given for one that is in the list.
    expect(await host.backupPath(status.lastFile!)).toBe(join(folder, status.lastFile!))
    await expect(host.backupPath('../../etc/passwd')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('refuses a folder inside the project, and keeps no setting for it', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = join(projectDir, 'content')
    expect(await host.chooseBackupFolder('x')).toEqual({ chosen: false, problem: 'inside' })
    expect((await host.backupStatus()).configured).toBe(false)
    pickedBackup = null
    expect(await host.chooseBackupFolder('x')).toEqual({ chosen: false, problem: null })
  })

  it('remembers the folder for the project, and stops when it is turned off', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = folder
    await host.chooseBackupFolder('x')
    await host.close()
    const again = makeHost()
    await again.pickAndOpen('x')
    expect((await again.backupStatus()).folder).toBe(folder)
    await again.disableBackup()
    expect(await again.backupStatus()).toMatchObject({ configured: false, folder: null })
    expect(await again.backups()).toEqual([])
  })

  it('backs up when something changed, from the timer and when the project closes', async () => {
    const host = makeHost({ backups: true })
    await host.pickAndOpen('x')
    pickedBackup = folder
    await host.chooseBackupFolder('x')
    expect((await host.backups()).length).toBe(1)
    // Unchanged: the timer makes nothing, even though it runs.
    await wait(300)
    expect((await host.backups()).length).toBe(1)
    // Closing backs up a change at once, without waiting for the hour.
    await writeFile(join(projectDir, 'content', 'neu.typ'), '= Neu\n')
    await host.close()
    const again = makeHost()
    await again.pickAndOpen('x')
    expect((await again.backups()).length).toBeGreaterThanOrEqual(1)
    expect((await again.backupStatus()).lastAt).not.toBeNull()
  })

  it('reports a folder that is not there (a drive that is unplugged) without failing', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = folder
    await host.chooseBackupFolder('x')
    await rm(folder, { recursive: true })
    expect(await host.runBackup(true)).toBe('unreachable')
    expect(await host.backupStatus()).toMatchObject({
      configured: true,
      reachable: false,
      error: 'unreachable',
    })
  })

  it('restores a backup into a new folder and opens it, without touching the project it came from', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = folder
    await host.chooseBackupFolder('x')
    const [file] = await host.backups()
    const parent = join(base, 'Neuer Rechner')
    await mkdir(parent)
    pickedRestoreTo = parent
    const snapshot = await host.restoreBackupByName(file!.name, 'Wohin?')
    expect(snapshot?.title).toBe('Beispielprojekt')
    // The folder has the name the project had, and is the open project now.
    expect(host.root).toBe(join(parent, 'copy'))
    expect(await readFile(join(parent, 'copy', 'project.toml'), 'utf8')).toContain(
      'Beispielprojekt',
    )
    expect((await readdir(parent)).filter((n) => n.startsWith('.'))).toEqual([]) // no temporary folder left
    // The original is as it was.
    expect(await readFile(join(projectDir, 'project.toml'), 'utf8')).toContain('Beispielprojekt')

    // A second restore does not overwrite the first: the folder is numbered.
    const again = await host.restoreFromZip(join(folder, file!.name), parent)
    expect(again.title).toBe('Beispielprojekt')
    expect(host.root).toBe(join(parent, 'copy (2)'))
    // Cancelled: nothing happens (the open project is now the restored one, which has no backups of its own).
    pickedRestoreTo = null
    await expect(host.restoreBackupByName(file!.name, 'Wohin?')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('restores a backup file that is picked, with no project open', async () => {
    const host = makeHost()
    await host.pickAndOpen('x')
    pickedBackup = folder
    await host.chooseBackupFolder('x')
    const [file] = await host.backups()
    await host.close()
    const fresh = makeHost()
    const parent = join(base, 'Wiederhergestellt')
    await mkdir(parent)
    pickedZip = join(folder, file!.name)
    pickedRestoreTo = parent
    const snapshot = await fresh.restoreBackupFromFile('Datei', 'Zip', 'Wohin?')
    expect(snapshot?.title).toBe('Beispielprojekt')
    pickedZip = null
    expect(await fresh.restoreBackupFromFile('Datei', 'Zip', 'Wohin?')).toBeNull()
  })

  it('refuses a zip that is no project or that is hostile, and leaves nothing behind', async () => {
    const host = makeHost()
    const parent = join(base, 'Ziel')
    await mkdir(parent)
    const { writeZip } = await import('./zip')
    const note = join(base, 'notiz.txt')
    await writeFile(note, 'x')
    const noProject = join(base, 'kein-projekt.zip')
    await writeZip(noProject, [{ name: 'Ordner/notiz.txt', path: note, mtime: 0 }])
    await expect(host.restoreFromZip(noProject, parent)).rejects.toMatchObject({
      code: 'not_a_project',
    })
    const evil = join(base, 'boese.zip')
    await writeZip(evil, [{ name: '../boese.txt', path: note, mtime: 0 }])
    await expect(host.restoreFromZip(evil, parent)).rejects.toMatchObject({ code: 'io' })
    expect(await readdir(parent)).toEqual([])
    expect(await readdir(base)).not.toContain('boese.txt')
    await writeFile(join(base, 'text.zip'), 'kein zip')
    await expect(host.restoreFromZip(join(base, 'text.zip'), parent)).rejects.toMatchObject({
      code: 'io',
    })
  })
})
