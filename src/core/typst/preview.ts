import type { Tree } from '@lezer/common'
import { plainText } from './footnotes'

/**
 * What a sheet looks like in the list: its first few lines, as plain text, the way
 * Ulysses shows its sheets. A heading is one entry with its level, so the list can draw it bold,
 * like a title; everything else is a paragraph. Markup, comments, and notes are left out.
 */

/** `[level, text]`: level 0 is a paragraph, 1 and more a heading. */
export type PreviewLine = [level: number, text: string]

/** The entries kept, and the characters of text they may hold together. */
export const PREVIEW_ENTRIES = 4
export const PREVIEW_CHARS = 240
export const TITLE_CHARS = 60

const HEADING = /^(=+)[ \t]+/
/** A line of code (`#set …`, `#let …`): not text. */
const CODE_LINE = /^\s*#(?:set|show|let|import|include|if|for|while|context|else)\b/

const clean = (text: string): string =>
  text
    .replace(/\$[^$\n]*\$/g, '…')
    .replace(/<[\p{L}\p{N}_:.-]+>/gu, '')
    .replace(/\\(.)/g, '$1')
    .replace(/^[-+][ \t]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

const shorten = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text

export function sheetPreview(tree: Tree, doc: string): { title: string; lines: PreviewLine[] } {
  const lines: PreviewLine[] = []
  let chars = 0
  let paragraph: string[] = []
  const full = (): boolean => lines.length >= PREVIEW_ENTRIES || chars >= PREVIEW_CHARS
  const flush = (): void => {
    if (paragraph.length === 0) return
    const text = shorten(paragraph.join(' '), PREVIEW_CHARS - chars)
    paragraph = []
    lines.push([0, text])
    chars += text.length
  }

  let at = 0
  while (at <= doc.length && !full()) {
    const next = doc.indexOf('\n', at)
    const end = next < 0 ? doc.length : next
    const line = doc.slice(at, end).replace(/\r$/, '')
    const heading = HEADING.exec(line)
    if (line.trim() === '') flush()
    else if (heading) {
      flush()
      const text = clean(plainText(tree, doc, at + heading[0].length, at + line.length))
      if (text !== '' && !full()) {
        const shown = shorten(text, PREVIEW_CHARS - chars)
        lines.push([heading[1]!.length, shown])
        chars += shown.length
      }
    } else if (!CODE_LINE.test(line)) {
      const text = clean(plainText(tree, doc, at, at + line.length))
      if (text !== '') paragraph.push(text)
      else if (!/^\s*(#|\/\/|\/\*)/.test(line)) flush()
    }
    if (next < 0) break
    at = next + 1
  }
  if (!full()) flush()
  const first = lines[0]
  return { title: first ? shorten(first[1], TITLE_CHARS) : '', lines }
}
