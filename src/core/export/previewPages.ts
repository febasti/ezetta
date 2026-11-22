/**
 * What the export dialog's preview knows about its pages besides their pictures: the size of each
 * page, so the column has its full length before a picture is loaded and can be zoomed, and where
 * each heading of the contents stands, for the outline beside the pages.
 */

/** A page's size in points, as the compiler set it. */
export interface PageSize {
  width: number
  height: number
}

/** A heading of the document as the contents list it: on which page and how far down it stands. */
export interface OutlineEntry {
  level: number
  /** The number the template prints, null for a heading without one. */
  number: string | null
  text: string
  /** The page, counted from 1 as the pictures are. */
  page: number
  /** From the top of the page, in points. */
  y: number
}

/** The size of a page from the start of its SVG file: the `viewBox`, in points. */
export function svgPageSize(head: string): PageSize | null {
  const box = /<svg\b[^>]*?\bviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(
    head,
  )
  if (!box) return null
  const width = Number(box[1])
  const height = Number(box[2])
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * Typst code that lists the headings of the compiled document, as `typst eval --in` gives it: the ones
 * the contents list (a heading with `outlined: false`, such as the contents' own title, is left
 * out), their number as the template prints it, their text without notes and citations, and where
 * they stand.
 */
export const OUTLINE_QUERY = `{
  let plain(it) = if it == none { "" } else if type(it) == str { it } else if type(it) != content { str(it) } else if it.func() in (footnote, cite, ref, metadata, label) { "" } else if it.func() == math.equation { "…" } else if it.func() == smartquote { if it.double { "\\"" } else { "'" } } else if it.func() == linebreak or it == [ ] { " " } else if it.has("text") { plain(it.text) } else if it.has("children") { it.children.fold("", (all, child) => all + plain(child)) } else if it.has("child") { plain(it.child) } else if it.has("body") { plain(it.body) } else { "" }
  query(heading).filter(h => h.outlined).map(h => {
    let at = h.location().position()
    let number = if h.numbering == none { none } else { numbering(h.numbering, ..counter(heading).at(h.location())) }
    (level: h.level, number: if number == none { none } else { plain(number) }, text: plain(h.body), page: at.page, y: at.y.pt())
  })
}`

/** Longest text kept of a heading: the outline shows one line. */
const MAX_TEXT = 300

/** The outline from what `typst eval` printed; entries on pages the preview does not have are dropped, and anything unreadable gives none. */
export function parseOutline(json: string, pages: number): OutlineEntry[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const out: OutlineEntry[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const { level, number, text, page, y } = item as Record<string, unknown>
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1) continue
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > pages) continue
    if (typeof y !== 'number' || !Number.isFinite(y)) continue
    if (typeof text !== 'string') continue
    const words = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    const shown = typeof number === 'string' ? number.trim().slice(0, 40) : ''
    out.push({
      level: Math.min(level, 6),
      number: shown === '' ? null : shown,
      text: words,
      page,
      y: Math.max(0, y),
    })
  }
  return out
}
