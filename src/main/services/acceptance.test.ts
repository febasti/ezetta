import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectSession } from '@core/project/session'
import type { Outcome, ProjectSnapshot } from '@core/project/session'
import type { GroupNode, TreeNode } from '@core/project/tree'
import { createRootedFs } from './rootedFs'

/**
 * End to end on the core: a project with ten groups and nested subgroups opens,
 * reorders, edits, and saves without data loss, including external renames and git operations.
 * Runs against a real folder and the real `git`.
 */

let base: string
let root: string
const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@example.org', '-c', 'user.name=Test', ...args], {
    cwd: root,
    encoding: 'utf8',
  })

const paths = (group: GroupNode): string[] =>
  group.children.flatMap((c: TreeNode) => (c.kind === 'group' ? [c.path, ...paths(c)] : [c.path]))
const ok = <T>(outcome: Outcome<T>): T => {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error))
  return outcome.value
}

async function put(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true })
  await writeFile(join(root, rel), content)
}

async function open(): Promise<ProjectSession> {
  return ok(
    await ProjectSession.open(
      createRootedFs(root, async (p) => void (await rm(p, { recursive: true }))),
    ),
  )
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'wm-accept-')))
  root = join(base, 'Thesis')
  await mkdir(root)
  const order: string[] = []
  const items: string[] = []
  for (let g = 1; g <= 10; g += 1) {
    const name = `Gruppe ${g}`
    order.push(`"${name}"`)
    await put(
      `content/${name}/Abschnitt A.typ`,
      `= Kapitel ${g}\n\nText von Gruppe ${g} mit Größe und Übung.\n`,
    )
    await put(`content/${name}/Abschnitt B.typ`, `Zweiter Abschnitt ${g}.\n`)
    await put(`content/${name}/Unter ${g}/Tief.typ`, `Tief verschachtelt ${g}.\n`)
    if (g % 3 === 0)
      await put(`content/${name}/Unter ${g}/Noch tiefer/Ganz tief.typ`, 'Ganz tief.\n')
    if (g === 2) items.push(`[items."${name}/Abschnitt A.typ"]\nstatus = "final"\ngoal = 500\n`)
    if (g === 5) items.push(`[items."${name}"]\nicon = "flask"\n`)
  }
  await put(
    'project.toml',
    `[project]\nversion = 1\ntitle = "Thesis"\nlanguage = "de"\n\n[order]\n"" = [${order.join(', ')}]\n\n${items.join('\n')}`,
  )
  await put('library.bib', '')
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'start')
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('a large project on disk', () => {
  it('opens ten groups with nested subgroups', async () => {
    const snap = (await open()).snapshot()
    expect(snap.tree.children.filter((c) => c.kind === 'group')).toHaveLength(10)
    expect(snap.totalSheets).toBe(10 * 3 + 3)
    expect(snap.tree.children.map((c) => c.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Gruppe ${i + 1}`),
    )
  })

  it('reorders, moves, edits, and saves, and everything is on disk and in the manifest', async () => {
    const session = await open()
    ok(await session.move('Gruppe 10', '', 0))
    ok(await session.move('Gruppe 2/Abschnitt B.typ', 'Gruppe 3/Unter 3', 0))
    ok(await session.rename('Gruppe 4', 'Methoden'))
    ok(await session.writeSheet('Gruppe 1/Abschnitt A.typ', 'Neu geschrieben, mit Größe.\n'))

    const reopened = (await open()).snapshot()
    expect(reopened.tree.children[0]?.name).toBe('Gruppe 10')
    expect(paths(reopened.tree)).toContain('Gruppe 3/Unter 3/Abschnitt B.typ')
    expect(paths(reopened.tree)).toContain('Methoden/Abschnitt A.typ')
    expect(await readFile(join(root, 'content/Gruppe 1/Abschnitt A.typ'), 'utf8')).toBe(
      'Neu geschrieben, mit Größe.\n',
    )
    expect(reopened.warnings.filter((w) => w.kind === 'missing' || w.kind === 'unlisted')).toEqual(
      [],
    )
    // Settings follow their items through moves and renames.
    const final = reopened.tree.children.find((c) => c.name === 'Gruppe 2')
    expect(final?.kind === 'group' && final.children[0]).toMatchObject({
      status: 'final',
      goal: 500,
    })
  })

  it('keeps every entry when files are renamed behind the app and then repaired', async () => {
    const session = await open()
    const before = paths(session.snapshot().tree)
    // Gruppe 2/Abschnitt A has status and goal, but no order list mentions it.
    await rename(
      join(root, 'content/Gruppe 2/Abschnitt A.typ'),
      join(root, 'content/Gruppe 2/Umbenannt.typ'),
    )
    await rename(join(root, 'content/Gruppe 7'), join(root, 'content/Gruppe Sieben'))
    await rename(join(root, 'content/Gruppe 5'), join(root, 'content/Fünf'))
    const { snapshot } = await session.refresh(null)
    expect(snapshot.warnings).toContainEqual({ kind: 'missing', path: 'Gruppe 2/Abschnitt A.typ' })
    expect(snapshot.warnings).toContainEqual({ kind: 'missing', path: 'Gruppe 7' })
    expect(snapshot.warnings).toContainEqual({ kind: 'missing', path: 'Gruppe 5' })
    // Nothing was dropped: the old entries are still listed, the new ones were added.
    const after = paths(snapshot.tree)
    for (const p of before.filter((p) => !p.startsWith('Gruppe 7/') && !p.startsWith('Gruppe 5/')))
      expect(after, p).toContain(p)
    expect(after).toContain('Gruppe Sieben')
    const manifest = await readFile(join(root, 'project.toml'), 'utf8')
    expect(manifest).toContain('Gruppe 7')
    expect(manifest).toContain('status = "final"')

    ok(await session.relink('Gruppe 7', 'Gruppe Sieben'))
    ok(await session.relink('Gruppe 5', 'Fünf'))
    ok(await session.relink('Gruppe 2/Abschnitt A.typ', 'Gruppe 2/Umbenannt.typ'))
    const repaired = session.snapshot()
    expect(repaired.warnings.filter((w) => w.kind === 'missing')).toEqual([])
    expect(repaired.tree.children[6]?.name).toBe('Gruppe Sieben') // same position as before
    // Settings came along: the icon of the renamed group and status and goal of the sheet.
    expect(repaired.tree.children.find((c) => c.name === 'Fünf')).toMatchObject({
      kind: 'group',
      icon: 'flask',
    })
    const group2 = repaired.tree.children.find((c) => c.name === 'Gruppe 2')
    expect(
      group2?.kind === 'group' && group2.children.find((c) => c.name === 'Umbenannt'),
    ).toMatchObject({ status: 'final', goal: 500 })
  })

  it('survives git branch switches, deleted folders, and restores without dropping entries', async () => {
    const session = await open()
    const original = paths(session.snapshot().tree)
    const manifest = await readFile(join(root, 'project.toml'), 'utf8')

    git('checkout', '-q', '-b', 'umbau')
    await rm(join(root, 'content/Gruppe 8'), { recursive: true })
    await put('content/Neue Gruppe/Neu.typ', 'Neu.\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'umbau')
    const onBranch = (await session.refresh(null)).snapshot
    expect(paths(onBranch.tree)).toContain('Neue Gruppe/Neu.typ')
    expect(onBranch.warnings).toContainEqual({ kind: 'missing', path: 'Gruppe 8' }) // kept, flagged
    expect(await readFile(join(root, 'project.toml'), 'utf8')).toBe(manifest) // never rewritten by reconciling

    git('checkout', '-q', '-')
    const restored = (await session.refresh(null)).snapshot
    expect(paths(restored.tree).sort()).toEqual(original.sort())
    expect(restored.warnings.filter((w) => w.kind === 'missing')).toEqual([])
    expect(await readFile(join(root, 'project.toml'), 'utf8')).toBe(manifest)
  })

  it('applies a manifest change that arrives with a git checkout', async () => {
    const session = await open()
    git('checkout', '-q', '-b', 'order')
    const text = await readFile(join(root, 'project.toml'), 'utf8')
    await writeFile(
      join(root, 'project.toml'),
      text.replace('"Gruppe 1", "Gruppe 2"', '"Gruppe 2", "Gruppe 1"'),
    )
    git('commit', '-q', '-am', 'order')
    expect(
      (await session.refresh(['project.toml'])).snapshot.tree.children
        .slice(0, 2)
        .map((c) => c.name),
    ).toEqual(['Gruppe 2', 'Gruppe 1'])
    git('checkout', '-q', '-')
    expect(
      (await session.refresh(['project.toml'])).snapshot.tree.children
        .slice(0, 2)
        .map((c) => c.name),
    ).toEqual(['Gruppe 1', 'Gruppe 2'])
  })

  it('produces a stable manifest: saving twice without changes does not change the file', async () => {
    const session = await open()
    ok(await session.setItem('Gruppe 1/Abschnitt A.typ', { status: 'revised' }))
    const first = await readFile(join(root, 'project.toml'), 'utf8')
    ok(await session.setItem('Gruppe 1/Abschnitt A.typ', { status: 'revised' }))
    expect(await readFile(join(root, 'project.toml'), 'utf8')).toBe(first)
    // And the file reads back to the same structure.
    const again = (await open()).snapshot()
    const strip = (s: ProjectSnapshot): unknown => ({ ...s, revision: 0 })
    expect(strip(again)).toEqual(strip(session.snapshot()))
  })
})
