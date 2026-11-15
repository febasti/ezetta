/**
 * A plain text that was wrapped by hand at some width, as its paragraphs: the lines a wrap broke
 * are joined again, so a narrower box can wrap them where it needs to. A line keeps its own place
 * when it is blank, a ruler (`=====`), the start of a list item, indented differently from the
 * line before, or short enough that the next word would still have fitted after it (a heading, the
 * last line of a paragraph, a line of its own such as "Source code: …"). The width a block was
 * wrapped at is taken to be its longest line.
 */
export interface ReflowedLine {
  /** Spaces before the text in the source. */
  indent: number
  text: string
  /** A line of one repeated mark (`=====`), drawn as wide as the box rather than wrapped. */
  ruler: boolean
}

const RULER = /^([=\-_*~#])\1{3,}$/
const LIST_ITEM = /^([-*•–]|\d+[.)]|\(?[a-z0-9]\))\s/i

export function reflow(source: string): ReflowedLine[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const indentOf = (line: string): number => line.length - line.trimStart().length
  const blank = (line: string): boolean => line.trim() === ''
  const ruler = (line: string): boolean => RULER.test(line.trim())

  // The longest line of each block of lines with the same indent: the width it was wrapped at.
  const width: number[] = new Array<number>(lines.length).fill(0)
  for (let start = 0; start < lines.length;) {
    let end = start + 1
    if (!blank(lines[start]!)) {
      while (
        end < lines.length &&
        !blank(lines[end]!) &&
        indentOf(lines[end]!) === indentOf(lines[start]!)
      )
        end++
    }
    const longest = Math.max(...lines.slice(start, end).map((line) => line.trimEnd().length))
    for (let i = start; i < end; i++) width[i] = longest
    start = end
  }

  const out: ReflowedLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd()
    const previous = i > 0 ? lines[i - 1]!.trimEnd() : ''
    const last = out.at(-1)
    const joins =
      last !== undefined &&
      !blank(line) &&
      !blank(previous) &&
      !ruler(line) &&
      !ruler(previous) &&
      !LIST_ITEM.test(line.trim()) &&
      indentOf(line) === indentOf(previous) &&
      // The wrap broke here only if the next word would not have fitted after the previous line.
      previous.length + 1 + (line.trim().split(/\s/)[0]?.length ?? 0) > width[i - 1]!
    if (joins) last.text += ' ' + line.trim()
    else
      out.push({ indent: blank(line) ? 0 : indentOf(line), text: line.trim(), ruler: ruler(line) })
  }
  return out
}
