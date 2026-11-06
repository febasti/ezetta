import type { Range, Text } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { WidgetType } from '@codemirror/view'
import { hidden } from './builder'

/**
 * How the decorations sit on the lines, decided once all of them are known: what stays on one line
 * (`keepTogether`) and the space at every line break (`lineSpacing`).
 */

/** Covers syntax drawn as a widget or hidden, with the text it touches (see `keepTogether`). */
const together = Decoration.mark({ class: 'cm-together', inclusive: true })

/**
 * No line break where syntax that is drawn as a widget touches the text without a space: a quotation
 * mark stays with the word it opens or closes, a footnote marker or a citation with the word or the
 * full stop before or after it. Hidden syntax has no width, so a break next to it only shows where
 * it splits a word (`H#sub[2]O`); only there is it kept with its neighbours. (A highlight's hidden
 * `::` is therefore never covered, and the highlight is not cut into pieces.)
 *
 * CodeMirror draws such a piece as a widget with an empty image on each side (`cm-widgetBuffer`,
 * for the caret), and the browser may break a line before or after any image. It may not break
 * inside an element with `white-space: nowrap`, so each piece is covered by such a mark together
 * with the character it touches on either side; pieces that meet are covered as one. The mark wraps
 * the widget only from a set of lower precedence than the widget's, so it is the outer element and
 * cuts a mark around it (the ground of an inline quote) into pieces, which look the same.
 */
export function keepTogether(doc: Text, ranges: readonly Range<Decoration>[]): Range<Decoration>[] {
  const spans: { from: number; to: number }[] = []
  const space = (pos: number): boolean => /\s/.test(doc.sliceString(pos, pos + 1))
  for (const { from, to, value } of ranges) {
    const spec = value.spec as { widget?: WidgetType; block?: boolean }
    if (to <= from || spec.block || !(value === hidden || spec.widget)) continue
    const before = from > 0 && !space(from - 1)
    const after = to < doc.length && !space(to)
    // Hidden syntax has no width: a break next to it is only seen when it splits a word.
    if (value === hidden && !(before && after)) continue
    if (before || after) spans.push({ from: before ? from - 1 : from, to: after ? to + 1 : to })
  }
  spans.sort((a, b) => a.from - b.from)
  const result: Range<Decoration>[] = []
  let current: { from: number; to: number } | null = null
  for (const span of spans) {
    if (current && span.from <= current.to) current.to = Math.max(current.to, span.to)
    else {
      if (current) result.push(together.range(current.from, current.to))
      current = { ...span }
    }
  }
  if (current) result.push(together.range(current.from, current.to))
  return result
}

/** Covers the text of a short line that has space above or below it (see `lineSpacing`). */
const unsampled = Decoration.mark({})

/** The lines of the kinds of paragraph that set the space between lines, by number. */
export interface LineKinds {
  headings: ReadonlySet<number>
  quotes: ReadonlySet<number>
  lists: ReadonlySet<number>
}

/**
 * The writer's space between paragraphs, as classes on the lines (styled in `writingTheme`). Typst
 * ends a paragraph at an empty line and reads a single line break as a space, and the editor shows
 * it so: the empty line after a paragraph is the gap between it and the next (`cm-gap`, as tall as
 * the gap), and a line that follows another with only a line break between them belongs to the same
 * paragraph and follows without space. A heading, a list item and a block quote are paragraphs of
 * their own however they are written, so a line next to one is set off from it (`cm-spaced`), and a
 * heading always is. A line that is drawn with nothing on it although it has text (all of it hidden) is as
 * tall as the gap (`cm-blank`), and a line followed by a block quote carries the space below it
 * (`cm-before-quote`), so the rule beside the quote does not reach up into it. A block widget (a
 * figure, a table, a formula on its own lines, the source of an epigraph) ends the run.
 *
 * This is decided from the text and the decorations, never from the lines CodeMirror happens to
 * have drawn. CodeMirror draws only the lines near the visible part and measures each one alone,
 * so a line's height must not depend on its neighbours in the DOM: a style that does
 * (`.cm-line + .cm-line`) changes the height of the first line drawn after an undrawn stretch,
 * and of the sample line CodeMirror measures to estimate the lines it has not drawn, and the
 * estimates of the whole sheet then jump while scrolling.
 *
 * For the same reason a short line with space above or below it is kept out of that sample:
 * CodeMirror takes its line height from a drawn line of at most 20 plain characters, and a mark
 * over the text makes it pass that line over.
 */
export function lineSpacing(
  doc: Text,
  ranges: readonly Range<Decoration>[],
  kinds: LineKinds,
): Range<Decoration>[] {
  const { headings, quotes, lists } = kinds
  /** Lines replaced by a block widget: not drawn as lines. */
  const replaced = new Set<number>()
  /** Lines with a block widget drawn just before them. */
  const afterWidget = new Set<number>()
  /** Lines with something drawn on them (a widget), so they are not blank even with no text. */
  const drawn = new Set<number>()
  /** Text hidden without a widget in its place, merged where it touches. */
  const hiddenSpans: { from: number; to: number }[] = []
  for (const { from, to, value } of ranges) {
    const spec = value.spec as { widget?: WidgetType; block?: boolean; side?: number }
    if (value === hidden) hiddenSpans.push({ from, to })
    else if (spec.widget && spec.block && to > from) {
      for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n += 1) replaced.add(n)
      afterWidget.add(doc.lineAt(to).number + 1)
    } else if (spec.widget && spec.block)
      afterWidget.add(doc.lineAt(from).number + ((spec.side ?? 0) > 0 ? 1 : 0))
    else if (spec.widget) drawn.add(doc.lineAt(from).number)
  }
  hiddenSpans.sort((a, b) => a.from - b.from)
  const merged: { from: number; to: number }[] = []
  for (const span of hiddenSpans) {
    const last = merged[merged.length - 1]
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to)
    else merged.push({ ...span })
  }

  const result: Range<Decoration>[] = []
  const classes = new Map<number, string[]>()
  const give = (n: number, className: string): void => {
    const list = classes.get(n)
    if (list) list.push(className)
    else classes.set(n, [className])
  }
  let span = 0
  /** Whether line `n` has text but is drawn with nothing on it: all of its text is hidden. */
  const blank = (n: number): boolean => {
    const line = doc.line(n)
    if (drawn.has(n) || line.length === 0) return false
    while (span < merged.length && merged[span]!.to < line.from) span += 1
    const cover = merged[span]
    return !!cover && cover.from <= line.from && cover.to >= line.to
  }
  /** Whether line `n` is empty as Typst reads it (only spaces), with nothing drawn on it. */
  const empty = (n: number): boolean => !drawn.has(n) && doc.line(n).text.trim() === ''
  /**
   * Whether line `n` starts a paragraph after line `p` although only a line break is between them:
   * a heading, a list item and a block quote are paragraphs of their own however they are written.
   */
  const starts = (n: number, p: number): boolean =>
    lists.has(n) || headings.has(p) || lists.has(p) || (quotes.has(p) && !quotes.has(n))
  let previous: { n: number; blank: boolean; empty: boolean } | null = null
  for (let n = 1; n <= doc.lines; n += 1) {
    if (replaced.has(n)) {
      previous = null
      continue
    }
    const isBlank = blank(n)
    const isEmpty = !isBlank && empty(n)
    if (isBlank) give(n, 'cm-blank')
    if (previous && !previous.blank && !afterWidget.has(n)) {
      if (isEmpty) {
        // The empty line after a paragraph is the gap to the next one. A further empty line is a
        // line like any other (the writer types into it), so it does not change when typed into.
        if (!previous.empty) give(n, 'cm-gap')
      } else if (quotes.has(n) && !quotes.has(previous.n) && !headings.has(n)) {
        if (!previous.empty) give(previous.n, 'cm-before-quote')
      } else if (!isBlank && (headings.has(n) || (!previous.empty && starts(n, previous.n)))) {
        give(n, 'cm-spaced')
      }
    }
    previous = { n, blank: isBlank, empty: isEmpty }
  }
  for (const [n, list] of classes) {
    const line = doc.line(n)
    result.push(Decoration.line({ class: list.join(' ') }).range(line.from))
    if (list.some((c) => c !== 'cm-blank') && line.length > 0 && line.length <= 20)
      result.push(unsampled.range(line.from, line.to))
  }
  return result
}
