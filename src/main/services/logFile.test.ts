import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogFile } from './logFile'

let base: string
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'ezetta-log-'))
})
afterEach(() => rm(base, { recursive: true, force: true }))

const at = () => new Date('2026-11-14T10:00:00.000Z')

describe('createLogFile', () => {
  it('writes a line with the time, the message and the cause, and makes the folder', async () => {
    const log = createLogFile(join(base, 'logs'), { now: at })
    log.write('watcher error', new Error('EMFILE'))
    log.write('plain')
    const text = await readFile(log.path, 'utf8')
    const lines = text.trimEnd().split('\n')
    expect(lines[0]).toMatch(/^2026-11-14T10:00:00\.000Z watcher error Error: EMFILE/)
    expect(text).toContain('2026-11-14T10:00:00.000Z plain\n')
  })

  it('keeps one older file when the log passes its size', async () => {
    const dir = join(base, 'logs')
    const log = createLogFile(dir, { maxBytes: 100, now: at })
    for (let i = 0; i < 10; i += 1) log.write(`message ${i}`)
    expect((await readdir(dir)).sort()).toEqual(['ezetta.log', 'ezetta.old.log'])
    const current = await readFile(join(dir, 'ezetta.log'), 'utf8')
    expect(current.length).toBeLessThanOrEqual(100)
    expect(current).toContain('message 9')
    // A new start goes on in the same file, with what it has in mind.
    const again = createLogFile(dir, { maxBytes: 100, now: at })
    again.write('after restart')
    expect(await readFile(join(dir, 'ezetta.log'), 'utf8')).toContain('after restart')
  })

  it('never throws when the folder cannot be made', async () => {
    const file = join(base, 'a-file')
    await writeFile(file, '')
    const log = createLogFile(join(file, 'logs'))
    expect(() => log.write('x')).not.toThrow()
  })
})
