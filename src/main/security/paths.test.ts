import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside, realFileInside } from './paths'

const root = resolve('/tmp/project')

describe('isInside', () => {
  it('accepts files below the root', () => {
    expect(isInside(root, resolve(root, 'assets/a.png'))).toBe(true)
  })
  it('rejects the root itself and its siblings', () => {
    expect(isInside(root, root)).toBe(false)
    expect(isInside(root, resolve('/tmp/project-other/a.png'))).toBe(false)
  })
  it('rejects traversal out of the root', () => {
    expect(isInside(root, resolve(root, '../secret.txt'))).toBe(false)
    expect(isInside(root, resolve(root, 'assets/../../secret.txt'))).toBe(false)
  })
})

describe('realFileInside', () => {
  it('follows links and refuses those that lead out of the root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ezetta-paths-'))
    try {
      const project = join(base, 'project')
      await mkdir(join(project, 'assets'), { recursive: true })
      await writeFile(join(project, 'assets', 'a.png'), 'png')
      await writeFile(join(base, 'secret.png'), 'secret')
      await symlink(join(base, 'secret.png'), join(project, 'assets', 'out.png'))
      await symlink(join(project, 'assets', 'a.png'), join(project, 'assets', 'in.png'))

      expect(await realFileInside(project, '/assets/a.png')).toMatch(/a\.png$/)
      expect(await realFileInside(project, '/assets/in.png')).toMatch(/a\.png$/)
      expect(await realFileInside(project, '/assets/out.png')).toBeNull()
      expect(await realFileInside(project, '/assets/missing.png')).toBeNull()
      expect(await realFileInside(project, '/../secret.png')).toBeNull()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
