import { describe, expect, it } from 'vitest'
import {
  isReserved,
  parseShortcut,
  sameShortcut,
  shortcutLabel,
  shortcutOf,
  toAccelerator,
  toCodeMirrorKey,
} from './shortcut'
import type { KeyInput } from './shortcut'

const key = (init: Partial<KeyInput> & { key: string; code: string }): KeyInput => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...init,
})

describe('shortcutOf', () => {
  it('reads Cmd plus a letter on a Mac, and Ctrl elsewhere', () => {
    expect(shortcutOf(key({ key: 'b', code: 'KeyB', metaKey: true }), true)).toEqual({ key: 'b' })
    expect(shortcutOf(key({ key: 'b', code: 'KeyB', ctrlKey: true }), true)).toBeNull()
    expect(shortcutOf(key({ key: 'b', code: 'KeyB', ctrlKey: true }), false)).toEqual({ key: 'b' })
  })

  it('lower-cases the key and turns Shift and Option into flags', () => {
    expect(
      shortcutOf(key({ key: 'R', code: 'KeyR', metaKey: true, shiftKey: true }), true),
    ).toEqual({ key: 'r', shift: true })
  })

  it('takes the physical key when Option or Shift change the typed character', () => {
    // Option P types "π" and Shift 7 types "/" on some layouts: the shortcut is still P and 7.
    expect(shortcutOf(key({ key: 'π', code: 'KeyP', metaKey: true, altKey: true }), true)).toEqual({
      key: 'p',
      alt: true,
    })
    expect(
      shortcutOf(key({ key: '/', code: 'Digit7', metaKey: true, shiftKey: true }), true),
    ).toEqual({ key: '7', shift: true })
    expect(shortcutOf(key({ key: '≤', code: 'Comma', metaKey: true, altKey: true }), true)).toEqual(
      {
        key: ',',
        alt: true,
      },
    )
  })

  it('is no shortcut without Cmd, on a modifier alone, or on a named key', () => {
    expect(shortcutOf(key({ key: 'b', code: 'KeyB' }), true)).toBeNull()
    expect(shortcutOf(key({ key: 'Meta', code: 'MetaLeft', metaKey: true }), true)).toBeNull()
    expect(shortcutOf(key({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true }), true)).toBeNull()
    expect(shortcutOf(key({ key: 'F5', code: 'F5', metaKey: true }), true)).toBeNull()
  })
})

describe('shortcuts as text', () => {
  it('labels them for the Mac and for the other systems', () => {
    expect(shortcutLabel({ key: 'p', alt: true, shift: true }, true)).toBe('⌥⇧⌘P')
    expect(shortcutLabel({ key: ',' }, true)).toBe('⌘,')
    expect(shortcutLabel({ key: 'k', shift: true }, false)).toBe('Ctrl+Shift+K')
  })

  it('writes them as an accelerator and as a CodeMirror key', () => {
    expect(toAccelerator({ key: 'f', alt: true })).toBe('CmdOrCtrl+Alt+F')
    expect(toCodeMirrorKey({ key: '7', shift: true })).toBe('Mod-Shift-7')
    expect(toCodeMirrorKey({ key: ',' })).toBe('Mod-,')
  })
})

describe('keeping the system its own', () => {
  it('reserves quit, hide, the clipboard, select all, undo and redo', () => {
    for (const reserved of ['q', 'w', 'h', 'm', 'c', 'v', 'x', 'a', 'z'])
      expect(isReserved({ key: reserved })).toBe(true)
    expect(isReserved({ key: 'z', shift: true })).toBe(true)
    expect(isReserved({ key: 'b' })).toBe(false)
    expect(isReserved({ key: 'c', alt: true })).toBe(false)
  })

  it('compares shortcuts by what they are, not by how they were written', () => {
    expect(sameShortcut({ key: 'a', shift: false }, { key: 'a' })).toBe(true)
    expect(sameShortcut({ key: 'a', shift: true }, { key: 'a' })).toBe(false)
    expect(sameShortcut(null, { key: 'a' })).toBe(false)
  })
})

describe('parseShortcut', () => {
  it('accepts what was stored and drops anything else', () => {
    expect(parseShortcut({ key: 'b', shift: true })).toEqual({ key: 'b', shift: true })
    expect(parseShortcut({ key: 'b', shift: false })).toEqual({ key: 'b' })
    expect(parseShortcut({ key: 'B' })).toBeNull()
    expect(parseShortcut({ key: 'bb' })).toBeNull()
    expect(parseShortcut({ key: 'b', alt: 'yes' })).toBeNull()
    expect(parseShortcut(null)).toBeNull()
    expect(parseShortcut('b')).toBeNull()
  })
})
