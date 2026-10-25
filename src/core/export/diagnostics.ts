/**
 * What the compiler says, read from `--diagnostic-format short`:
 * `path:line:column: error: message`. A line in a sheet's preprocessed copy is the same line in the
 * sheet, because preprocessing keeps the line breaks, so the place maps back one to one.
 */

export interface Diagnostic {
  severity: 'error' | 'warning'
  /** The sheet, relative to `content/`, when the message is about one; null for the template or the main file. */
  sheet: string | null
  /** The file as the compiler named it. */
  file: string
  line: number
  column: number
  message: string
}

const LINE = /^(.+?):(\d+):(\d+): (error|warning): (.*)$/

/** The folder the preprocessed sheets are written to, relative to the project. */
export const SHEET_COPIES = '_build/content/'

export function parseDiagnostics(output: string): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const text of output.split(/\r?\n/)) {
    const match = LINE.exec(text.trim())
    if (!match) continue
    const file = match[1]!.replaceAll('\\', '/')
    out.push({
      severity: match[4] as Diagnostic['severity'],
      sheet: file.startsWith(SHEET_COPIES) ? file.slice(SHEET_COPIES.length) : null,
      file,
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[5]!,
    })
  }
  return out
}
