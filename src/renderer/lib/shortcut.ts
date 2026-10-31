/** A keyboard shortcut. "Mod" is Cmd on macOS and Ctrl elsewhere. `key` is lower case. */
export interface Shortcut {
  key: string
  shift?: boolean
  alt?: boolean
}

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform)

export function shortcutLabel(shortcut: Shortcut, mac: boolean = isMac()): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  if (mac) return `${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shortcut.alt ? 'Alt+' : ''}${shortcut.shift ? 'Shift+' : ''}${key}`
}

/** The keys that are not letters or digits, by their physical place (`KeyboardEvent.code`). */
const PUNCTUATION: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Minus: '-',
  Equal: '=',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
}

/** The key a physical key stands for, whatever Shift or Option turn the typed character into. */
function baseKey(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!.toLowerCase()
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]!
  return PUNCTUATION[code] ?? null
}

/** The part of a key event that makes a shortcut: a plain object, so it can be tested. */
export interface KeyInput {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Shift', 'Alt', 'AltGraph', 'OS', 'Hyper'])

export const isModifierKey = (event: Pick<KeyInput, 'key'>): boolean => MODIFIER_KEYS.has(event.key)

/**
 * The shortcut a key event is, or null when it is not one: no Cmd (Ctrl), a modifier on its own, or
 * a key that is not a single character (arrows, function keys). With Shift or Option held the typed
 * character is not the key ("Option P" types "π", "Shift 7" types "/" on some layouts), so the
 * physical key decides; otherwise the typed character does, as the writer's layout has it.
 * On Windows, AltGr arrives as Ctrl and Alt together: a key that Ctrl and Alt turn into another
 * character (@, {, ², € on a German keyboard) is typed text, not a shortcut, as CodeMirror has it.
 */
export function shortcutOf(event: KeyInput, mac: boolean = isMac()): Shortcut | null {
  if (isModifierKey(event)) return null
  if (!(mac ? event.metaKey : event.ctrlKey)) return null
  if (!mac && event.altKey && !event.shiftKey && event.key.length === 1) {
    const base = baseKey(event.code)
    if (base !== null && event.key.toLowerCase() !== base) return null
  }
  let key = event.key.toLowerCase()
  if (event.shiftKey || event.altKey) key = baseKey(event.code) ?? key
  if (key.length !== 1) return null
  return {
    key,
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
  }
}

export const sameShortcut = (a: Shortcut | null | undefined, b: Shortcut | null | undefined) =>
  !!a && !!b && a.key === b.key && !!a.shift === !!b.shift && !!a.alt === !!b.alt

export function matches(event: KeyboardEvent, shortcut: Shortcut): boolean {
  return sameShortcut(shortcutOf(event), shortcut)
}

/**
 * Shortcuts the system or the editor keep for themselves (quit, hide, minimise, close the window,
 * the clipboard, select all, undo and redo): the app's commands cannot take them.
 */
const RESERVED: readonly Shortcut[] = [
  { key: 'q' },
  { key: 'w' },
  { key: 'h' },
  { key: 'h', alt: true },
  { key: 'm' },
  { key: 'c' },
  { key: 'v' },
  { key: 'x' },
  { key: 'a' },
  { key: 'z' },
  { key: 'z', shift: true },
  { key: 'y' },
]

export const isReserved = (shortcut: Shortcut): boolean =>
  RESERVED.some((reserved) => sameShortcut(reserved, shortcut))

/** A stored shortcut, checked: anything else is dropped rather than trusted. */
export function parseShortcut(value: unknown): Shortcut | null {
  if (typeof value !== 'object' || value === null) return null
  const { key, shift, alt } = value as Record<string, unknown>
  if (typeof key !== 'string' || key.length !== 1 || key !== key.toLowerCase()) return null
  if (shift !== undefined && typeof shift !== 'boolean') return null
  if (alt !== undefined && typeof alt !== 'boolean') return null
  return { key, ...(shift ? { shift: true } : {}), ...(alt ? { alt: true } : {}) }
}

/** The same shortcut in Electron's format, which a native menu shows beside the item. */
export const toAccelerator = (shortcut: Shortcut): string =>
  `CmdOrCtrl+${shortcut.alt ? 'Alt+' : ''}${shortcut.shift ? 'Shift+' : ''}${shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key}`

/** The same shortcut as a CodeMirror key name. */
export const toCodeMirrorKey = (shortcut: Shortcut): string =>
  `Mod-${shortcut.alt ? 'Alt-' : ''}${shortcut.shift ? 'Shift-' : ''}${shortcut.key}`
