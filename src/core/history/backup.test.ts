import { describe, expect, it } from 'vitest'
import {
  BACKUP_INTERVAL_MS,
  KEEP_NEWEST,
  backupDue,
  backupFileName,
  backupsToDelete,
  parseBackupName,
  titleForFile,
} from './backup'
import type { BackupFile } from './backup'

const at = (y: number, m: number, d: number, h = 12, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()

describe('the name of a backup', () => {
  it('has the title, then the local date and time to the minute', () => {
    expect(backupFileName('Dissertation', at(2026, 10, 12, 14, 5))).toBe(
      'Dissertation 2026-10-12 14.05.zip',
    )
  })

  it('reads back the time, only for files of the project that follow the pattern', () => {
    const time = at(2026, 10, 12, 14, 5)
    expect(parseBackupName('Dissertation 2026-10-12 14.05.zip', 'Dissertation')).toBe(time)
    expect(parseBackupName('Andere 2026-10-12 14.05.zip', 'Dissertation')).toBeNull()
    expect(parseBackupName('Dissertation 2026-10-12 14.05.pdf', 'Dissertation')).toBeNull()
    expect(parseBackupName('Dissertation notizen.zip', 'Dissertation')).toBeNull()
    expect(parseBackupName('Dissertation 2026-13-12 14.05.zip', 'Dissertation')).toBeNull()
    expect(parseBackupName('Dissertation 2026-04-31 14.05.zip', 'Dissertation')).toBeNull()
  })

  it('makes a title safe for a file name', () => {
    expect(titleForFile('Mein/Projekt: "Test"?')).toBe('Mein-Projekt- -Test--')
    expect(titleForFile('  ')).toBe('Projekt')
    expect(titleForFile('..hidden..')).toBe('hidden')
    expect(parseBackupName(backupFileName('A/B', at(2026, 1, 2)), 'A/B')).toBe(at(2026, 1, 2))
  })
})

describe('backupsToDelete', () => {
  const file = (time: number): BackupFile => ({
    name: backupFileName('P', time),
    time,
    size: 1,
  })
  const now = at(2026, 10, 12, 18)

  it('keeps everything while there are few', () => {
    const few = Array.from({ length: KEEP_NEWEST }, (_, i) =>
      file(at(2026, 10, 12, 8 + (i % 9), i)),
    )
    expect(backupsToDelete(few, now)).toEqual([])
  })

  it('keeps the newest ten, and one per day beyond them', () => {
    // Six backups on each of the last two days: the newest ten stay, and so does the newest of each day.
    const files = [
      ...Array.from({ length: 6 }, (_, i) => file(at(2026, 10, 12, 8 + i))),
      ...Array.from({ length: 6 }, (_, i) => file(at(2026, 10, 11, 8 + i))),
    ]
    const deleted = backupsToDelete(files, now)
    expect(deleted).toHaveLength(2)
    // The two oldest of yesterday go; yesterday's newest is also the newest of its day.
    expect(deleted.map((f) => f.time).sort()).toEqual([at(2026, 10, 11, 8), at(2026, 10, 11, 9)])
  })

  it('thins old backups to one per day, then per week, then per month', () => {
    const files = [
      file(at(2026, 10, 12)), // today
      ...Array.from({ length: 12 }, (_, i) => file(at(2026, 10, 1 + i, 9))), // earlier this month, a day each
      file(at(2026, 10, 3, 18)), // a second one that day: the older one of the two goes
      file(at(2026, 8, 5)), // about 5 weeks back, alone in its week
      file(at(2026, 8, 6)), // the same week: only the newer stays
      file(at(2025, 11, 20)), // about 11 months back
      file(at(2025, 11, 25)), // the same month: only the newer stays
      file(at(2023, 1, 1)), // beyond two years: goes
    ]
    const deleted = backupsToDelete(files, now).map((f) => f.time)
    expect(deleted).toContain(at(2026, 10, 3, 9))
    expect(deleted).not.toContain(at(2026, 10, 3, 18))
    expect(deleted).toContain(at(2026, 8, 5))
    expect(deleted).not.toContain(at(2026, 8, 6))
    expect(deleted).toContain(at(2025, 11, 20))
    expect(deleted).not.toContain(at(2025, 11, 25))
    expect(deleted).toContain(at(2023, 1, 1))
  })

  it('never lists a file twice and leaves the input alone', () => {
    const files = Array.from({ length: 30 }, (_, i) => file(at(2026, 9, 1 + (i % 28), 10, i)))
    const copy = [...files]
    const deleted = backupsToDelete(files, now)
    expect(new Set(deleted).size).toBe(deleted.length)
    expect(files).toEqual(copy)
  })
})

describe('backupDue', () => {
  it('needs a change, and an old enough last backup', () => {
    expect(backupDue(null, 1, true)).toBe(true)
    expect(backupDue(null, 1, false)).toBe(false)
    expect(backupDue(0, BACKUP_INTERVAL_MS - 1, true)).toBe(false)
    expect(backupDue(0, BACKUP_INTERVAL_MS, true)).toBe(true)
  })
})
