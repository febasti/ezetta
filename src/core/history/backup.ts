/**
 * Backups of a project, the pure part: the names of the backup files, and which old
 * ones are no longer needed. A backup is a zip of the project folder in a folder the writer chose,
 * such as a drive or a folder that a cloud service syncs. The files are made in the main process.
 */

/** A backup that is made at most this often while the project is open (and only if it changed). */
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000

/** How many of the newest backups are always kept, and how far back each kind of thinning goes. */
export const KEEP_NEWEST = 10
export const KEEP_DAILY_DAYS = 14
export const KEEP_WEEKLY_WEEKS = 12
export const KEEP_MONTHLY_MONTHS = 24

export interface BackupFile {
  /** The file name in the backup folder. */
  name: string
  /** When the backup was made, read from its name (local time), in milliseconds. */
  time: number
  size: number
}

const two = (n: number): string => String(n).padStart(2, '0')

/** A project's title as part of a file name: no character that a file system forbids. */
export function titleForFile(title: string): string {
  // Control characters are dropped by code: a pattern with them is flagged by the linter.
  const printable = [...title].filter((c) => c.charCodeAt(0) >= 32).join('')
  const clean = printable
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return (clean.replace(/^\.+/, '').replace(/\.+$/, '') || 'Projekt').slice(0, 80)
}

/** `Dissertation 2026-10-12 14.30.zip`: the title, then the local date and time to the minute. */
export function backupFileName(title: string, time: number): string {
  const d = new Date(time)
  const date = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
  return `${titleForFile(title)} ${date} ${two(d.getHours())}.${two(d.getMinutes())}.zip`
}

/** The time in a backup's name, or null when the file is not one of this project's backups. */
export function parseBackupName(name: string, title: string): number | null {
  const prefix = `${titleForFile(title)} `
  if (!name.startsWith(prefix)) return null
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.zip$/.exec(name.slice(prefix.length))
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  const date = new Date(year, month - 1, day, hour, minute)
  // Reject dates that do not exist (month 13, the 31st of April).
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date.getTime()
    : null
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}`
/** The Monday of the week of a date, as a key. */
const weekKey = (d: Date): string => {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(monday)
}

/**
 * Which backups are no longer needed: all but the newest ten, the newest of each day for two weeks,
 * the newest of each week for twelve weeks, and the newest of each month for two years. Only files
 * of this project that this app made are ever considered (see `parseBackupName`).
 */
export function backupsToDelete(files: readonly BackupFile[], now: number): BackupFile[] {
  const newestFirst = [...files].sort((a, b) => b.time - a.time)
  const keep = new Set<BackupFile>(newestFirst.slice(0, KEEP_NEWEST))
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const seenDay = new Set<string>()
  const seenWeek = new Set<string>()
  const seenMonth = new Set<string>()
  for (const file of newestFirst) {
    const d = new Date(file.time)
    const daysAgo = Math.round(
      (startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000,
    )
    const keyDay = dayKey(d)
    if (daysAgo < KEEP_DAILY_DAYS && !seenDay.has(keyDay)) {
      seenDay.add(keyDay)
      keep.add(file)
    }
    const keyWeek = weekKey(d)
    if (daysAgo < KEEP_WEEKLY_WEEKS * 7 && !seenWeek.has(keyWeek)) {
      seenWeek.add(keyWeek)
      keep.add(file)
    }
    const keyMonth = monthKey(d)
    const monthsAgo = (today.getFullYear() - d.getFullYear()) * 12 + today.getMonth() - d.getMonth()
    if (monthsAgo < KEEP_MONTHLY_MONTHS && !seenMonth.has(keyMonth)) {
      seenMonth.add(keyMonth)
      keep.add(file)
    }
  }
  return newestFirst.filter((file) => !keep.has(file))
}

/** True when a backup is due: something changed since the last one, and it is old enough. */
export function backupDue(lastAt: number | null, now: number, changed: boolean): boolean {
  return changed && (lastAt === null || now - lastAt >= BACKUP_INTERVAL_MS)
}
