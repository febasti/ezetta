import type { NumberedTarget } from './targets'

/**
 * The Gliederung: the headings of the project in export order, numbered as the export's
 * template numbers them, with a flag where a level is skipped (a level 3 right after a level 1).
 * Headings of sheets that are not in the export are listed too, without a number, and do not count
 * for the skipping, since they are not printed.
 */
export interface OutlineEntry {
  /** The sheet the heading is in. */
  path: string
  level: number
  title: string
  /** "2.1" as the template numbers it, or "" (not numbered, or not in the export). */
  number: string
  /** Where the heading starts in its sheet, for going there. */
  at: number
  inExport: boolean
  /** The level before it when this heading skips a level (0 before the first heading), else null. */
  skippedFrom: number | null
}

export function outlineOf(targets: readonly NumberedTarget[]): OutlineEntry[] {
  let previous = 0
  return targets
    .filter((target) => target.kind === 'sec')
    .map((target) => {
      let skippedFrom: number | null = null
      if (target.inExport) {
        if (target.level > previous + 1) skippedFrom = previous
        previous = target.level
      }
      return {
        path: target.path,
        level: target.level,
        title: target.title,
        number: target.number,
        at: target.at,
        inExport: target.inExport,
        skippedFrom,
      }
    })
}

/** How many headings skip a level: the count the outline's header shows. */
export const skippedLevels = (outline: readonly OutlineEntry[]): number =>
  outline.filter((entry) => entry.skippedFrom !== null).length
