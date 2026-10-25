import {
  FONT_KINDS,
  FONT_OF,
  FONT_SIZE,
  LEGACY_FONT_SIZES,
  LEGACY_LINE_SPACINGS,
  LINE_SPACING,
  PARAGRAPH_GAP,
  TEXT_WIDTH,
  clampSetting,
} from './fonts'
import type { FontChoice, FontKind, NumberSetting } from './fonts'

/**
 * The look of the writing surface that the writer chooses: a serif, sans-serif or
 * monospace face, its size and the line spacing. Kept like the theme (in the browser storage of the
 * renderer), applied as CSS custom properties on the page, which the editor's theme and every other
 * writing surface already read (`--font-writing`, `--text-writing`, `--line-writing`).
 */

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.find((candidate) => candidate === value) ?? fallback
  } catch {
    return fallback
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not kept; applies for this session only
  }
}

const KIND_KEY = 'font-kind'
const SIZE_KEY = 'font-size'
const LINE_KEY = 'line-spacing'
const PARAGRAPH_KEY = 'paragraph-spacing'
const WIDTH_KEY = 'text-width'

let kind = $state<FontKind>(stored(KIND_KEY, FONT_KINDS, 'serif'))
/** A stored number; an earlier named choice is read as the number it stood for. */
function storedNumber(
  key: string,
  setting: NumberSetting,
  legacy: Record<string, number> = {},
): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return setting.default
    return clampSetting(setting, legacy[raw] ?? Number(raw))
  } catch {
    return setting.default
  }
}

let size = $state(storedNumber(SIZE_KEY, FONT_SIZE, LEGACY_FONT_SIZES))
let line = $state(storedNumber(LINE_KEY, LINE_SPACING, LEGACY_LINE_SPACINGS))
let paragraph = $state(storedNumber(PARAGRAPH_KEY, PARAGRAPH_GAP))
let width = $state(storedNumber(WIDTH_KEY, TEXT_WIDTH))

const root = document.documentElement

const current = (): FontChoice => FONT_OF[kind]

/** Puts the choice on the page. The editor measures its text again once the face is there. */
function apply(): void {
  const writing = current()
  root.style.setProperty('--font-writing', writing.stack)
  // Code, raw text and the source of a formula use the monospace face.
  root.style.setProperty('--font-mono', FONT_OF.mono.stack)
  root.style.setProperty('--text-writing', `${Math.round(size * writing.scale * 100) / 100}px`)
  root.style.setProperty('--line-writing', String(line))
  root.style.setProperty('--measure-writing', `${width}px`)
  root.style.setProperty('--paragraph-gap-writing', `calc(var(--text-writing) * ${paragraph})`)
  // CodeMirror measures its lines when the window changes size; a new face changes them as well.
  const measure = (): void => void window.dispatchEvent(new Event('resize'))
  const first = writing.stack.split(',')[0]!.trim()
  if (document.fonts?.load)
    void document.fonts
      .load(`1em ${first}`)
      .then(measure, measure)
      .catch(() => undefined)
  else measure()
}

apply()

export const typography = {
  get kind(): FontKind {
    return kind
  },
  set kind(next: FontKind) {
    kind = next
    persist(KIND_KEY, next)
    apply()
  },
  get size(): number {
    return size
  },
  set size(next: number) {
    size = clampSetting(FONT_SIZE, next)
    persist(SIZE_KEY, String(size))
    apply()
  },
  get lineSpacing(): number {
    return line
  },
  set lineSpacing(next: number) {
    line = clampSetting(LINE_SPACING, next)
    persist(LINE_KEY, String(line))
    apply()
  },
  get paragraphGap(): number {
    return paragraph
  },
  set paragraphGap(next: number) {
    paragraph = clampSetting(PARAGRAPH_GAP, next)
    persist(PARAGRAPH_KEY, String(paragraph))
    apply()
  },
  get width(): number {
    return width
  },
  set width(next: number) {
    width = clampSetting(TEXT_WIDTH, next)
    persist(WIDTH_KEY, String(width))
    apply()
  },
  /** The face the writing surface uses now. */
  get writingFont(): FontChoice {
    return current()
  },
}
