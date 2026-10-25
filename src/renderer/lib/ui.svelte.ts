import { i18n } from '../i18n/i18n.svelte'
import type { MessageKey } from '../i18n/translate'
import { fitColumns } from './layout'
import type { Column } from './layout'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  resolve: (confirmed: boolean) => void
}

export interface PromptRequest {
  title: string
  label: string
  initial: string
  inputMode?: 'numeric' | 'text'
  /** A further button on the left (such as "Link entfernen"): it closes the dialog and runs. */
  action?: { label: string; run: () => void }
  resolve: (value: string | null) => void
}

export interface Notice {
  kind: 'info' | 'error'
  text: string
}

/** Where footnotes are shown and written: in the margin, in a list below the text, or in a floating card. */
export type FootnoteMode = 'margin' | 'list' | 'cards'

/**
 * The stored choice. Two settings became one: a list below the text that was switched on is the
 * mode "list", and the old mode "in the text" (the note expanded in the flow) is gone, so it is the
 * margin.
 */
function footnoteModeFromStore(): FootnoteMode {
  const mode = stored<string>('footnoteMode', 'margin')
  if (mode === 'list' || mode === 'cards') return mode
  return stored('notesPanel', false) ? 'list' : 'margin'
}

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`ui.${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(`ui.${key}`, JSON.stringify(value))
  } catch {
    // not persisted; applies for this session only
  }
}

/** The narrowest each column may be: below this its header and rows no longer fit. */
const MIN_WIDTH = { groups: 160, sheets: 200, outline: 220, right: 240 } as const
const clampWidth = (value: number, column: keyof typeof MIN_WIDTH): number =>
  Math.min(520, Math.max(MIN_WIDTH[column], value))

/** The window's width, kept up to date: the columns are fitted to it (`lib/layout.ts`). */
const windowWidth = $state({ value: typeof window === 'undefined' ? 1280 : window.innerWidth })
if (typeof window !== 'undefined')
  window.addEventListener('resize', () => (windowWidth.value = window.innerWidth))

export const ui = $state({
  groupsVisible: stored('groupsVisible', true),
  sheetsVisible: stored('sheetsVisible', true),
  groupsWidth: clampWidth(stored('groupsWidth', 220), 'groups'),
  sheetsWidth: clampWidth(stored('sheetsWidth', 280), 'sheets'),
  /** The Gliederung: the headings of the project, shown in the sidebar instead of its two columns. */
  outlineVisible: stored('outlineVisible', false),
  outlineWidth: clampWidth(stored('outlineWidth', 300), 'outline'),
  /** The right sidebar: its tabs are the cited works, the proofing issues, and the statistics. */
  rightSidebarVisible: stored('rightSidebarVisible', false),
  rightSidebarWidth: clampWidth(stored('rightWidth', 300), 'right'),
  /** What the Literatur tab covers. */
  literatureScope: stored<'sheet' | 'group' | 'project'>('literatureScope', 'sheet'),
  /** The tab of the right sidebar: the cited works, or the spelling and grammar issues. */
  rightTab: stored<'literature' | 'proof' | 'stats'>('rightTab', 'literature'),
  confirm: null as ConfirmRequest | null,
  prompt: null as PromptRequest | null,
  /** The size picker under the toolbar's table button: where it opens, and what a click does. */
  tablePicker: null as null | {
    x: number
    y: number
    pick: (rows: number, columns: number) => void
  },
  /** The edit popover of a group (name, colour, symbol): which group. */
  groupEditor: null as null | { path: string },
  notice: null as Notice | null,
  /** Show raw Typst source everywhere instead of hiding syntax. */
  showSource: stored('showSource', false),
  /** Typewriter scrolling (`editor/focus.ts`). */
  typewriter: stored('typewriter', false),
  /** Where footnotes show: in the margin, or in the text. */
  footnoteMode: footnoteModeFromStore(),
  /** Where the text column sits while the margin column is shown, for the header to line up with. */
  column: null as { left: number; width: number } | null,
  /** Width of the editor's scrollbar, so the header above it can line up with the text. */
  scrollbarWidth: 0,
})

/** Showing a column of the sidebar leaves the Gliederung, which stands in their place. */
export function setGroupsVisible(visible: boolean): void {
  if (visible) setOutlineVisible(false)
  ui.groupsVisible = visible
  persist('groupsVisible', visible)
}

export function setSheetsVisible(visible: boolean): void {
  if (visible) setOutlineVisible(false)
  ui.sheetsVisible = visible
  persist('sheetsVisible', visible)
}

export function setOutlineVisible(visible: boolean): void {
  ui.outlineVisible = visible
  persist('outlineVisible', visible)
}

export function setTypewriter(on: boolean): void {
  ui.typewriter = on
  persist('typewriter', on)
}

export function setShowSource(show: boolean): void {
  ui.showSource = show
  persist('showSource', show)
}

export function setFootnoteMode(mode: FootnoteMode): void {
  ui.footnoteMode = mode
  persist('footnoteMode', mode)
}

export function setRightSidebarVisible(visible: boolean): void {
  ui.rightSidebarVisible = visible
  persist('rightSidebarVisible', visible)
}

/** The sidebar button: shows or hides the sidebar, on the tab it showed last. */
export function toggleRightSidebar(): void {
  setRightSidebarVisible(!ui.rightSidebarVisible)
}

export function setRightTab(tab: 'literature' | 'proof' | 'stats'): void {
  ui.rightTab = tab
  persist('rightTab', tab)
}

/** Opens the right sidebar on a tab. */
export function showRightTab(tab: 'literature' | 'proof' | 'stats'): void {
  setRightTab(tab)
  setRightSidebarVisible(true)
}

/** The text is proofread only while the Prüfung tab is showing. */
export const proofActive = (): boolean => ui.rightSidebarVisible && ui.rightTab === 'proof'

export function setLiteratureScope(scope: 'sheet' | 'group' | 'project'): void {
  ui.literatureScope = scope
  persist('literatureScope', scope)
}

export function setWidth(column: 'groups' | 'sheets' | 'outline' | 'right', width: number): void {
  const clamped = clampWidth(width, column)
  if (column === 'groups') ui.groupsWidth = clamped
  else if (column === 'sheets') ui.sheetsWidth = clamped
  else if (column === 'outline') ui.outlineWidth = clamped
  else ui.rightSidebarWidth = clamped
  persist(`${column}Width`, clamped)
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null

/** `ms` keeps a long notice on screen long enough to be read. */
export function notify(kind: Notice['kind'], text: string, ms?: number): void {
  ui.notice = { kind, text }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (ui.notice = null), ms ?? (kind === 'error' ? 9000 : 4000))
}

export function dismissNotice(): void {
  ui.notice = null
}

export function confirmDialog(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    ui.confirm = { ...request, resolve }
  })
}

export function promptDialog(request: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    ui.prompt = { ...request, resolve }
  })
}

export const text = (key: MessageKey, params?: Record<string, string | number>): string =>
  i18n.t(key, params)

/**
 * The widths the columns have now: those the writer chose, narrowed where the window is too small
 * to leave the editor its width, and `right` null when the right sidebar has no room at all.
 */
export function fittedWidths(): {
  outline: number
  groups: number
  sheets: number
  right: number | null
} {
  const left: { key: 'outline' | 'groups' | 'sheets'; column: Column }[] = []
  if (ui.outlineVisible)
    left.push({ key: 'outline', column: { width: ui.outlineWidth, min: MIN_WIDTH.outline } })
  else {
    if (ui.groupsVisible)
      left.push({ key: 'groups', column: { width: ui.groupsWidth, min: MIN_WIDTH.groups } })
    if (ui.sheetsVisible)
      left.push({ key: 'sheets', column: { width: ui.sheetsWidth, min: MIN_WIDTH.sheets } })
  }
  const right = ui.rightSidebarVisible
    ? { width: ui.rightSidebarWidth, min: MIN_WIDTH.right }
    : null
  const fitted = fitColumns(
    windowWidth.value,
    left.map((l) => l.column),
    right,
  )
  const widths = { outline: ui.outlineWidth, groups: ui.groupsWidth, sheets: ui.sheetsWidth }
  left.forEach((l, i) => (widths[l.key] = fitted.left[i]!))
  return { ...widths, right: fitted.right }
}
