import { describe, expect, it } from 'vitest'
import {
  AUTO_INTERVAL_MS,
  autoVersionDue,
  decodeMessage,
  encodeMessage,
  isBinary,
  isVersioned,
  sheetOfPath,
  sheetTitle,
} from './versions'

describe('isVersioned', () => {
  it('keeps the project files and leaves out hidden ones, the build folder and the store', () => {
    expect(isVersioned('project.toml')).toBe(true)
    expect(isVersioned('content/methoden/design.typ')).toBe(true)
    expect(isVersioned('assets/bild.png')).toBe(true)
    expect(isVersioned('library.bib')).toBe(true)
    expect(isVersioned('_build/out.pdf')).toBe(false)
    expect(isVersioned('.ezetta/history.git/HEAD')).toBe(false)
    expect(isVersioned('.git/config')).toBe(false)
    expect(isVersioned('content/.hidden.typ')).toBe(false)
    expect(isVersioned('node_modules/x/index.js')).toBe(false)
  })
})

describe('the message of a version', () => {
  it('carries the kind and the name, and reads back', () => {
    expect(decodeMessage(encodeMessage('named', 'Abgabe an Betreuer'))).toEqual({
      kind: 'named',
      name: 'Abgabe an Betreuer',
    })
    expect(decodeMessage(encodeMessage('auto', null))).toEqual({ kind: 'auto', name: null })
    expect(decodeMessage(encodeMessage('restore', ''))).toEqual({ kind: 'restore', name: null })
  })

  it('keeps a name on one line, and reads a plain commit message as an automatic version', () => {
    expect(decodeMessage(encodeMessage('named', 'zwei\nZeilen  hier')).name).toBe(
      'zwei Zeilen hier',
    )
    expect(decodeMessage('Fix typo')).toEqual({ kind: 'auto', name: 'Fix typo' })
  })
})

describe('sheets', () => {
  it('maps a file to its sheet path, and others to null', () => {
    expect(sheetOfPath('content/methoden/s-k4x9tm.typ')).toBe('methoden/s-k4x9tm.typ')
    expect(sheetOfPath('material/Recherche/s-k4x9tm.typ')).toBe(':material/Recherche/s-k4x9tm.typ')
    expect(sheetOfPath('material/Recherche/notes.txt')).toBeNull()
    expect(sheetOfPath('project.toml')).toBeNull()
    expect(sheetOfPath('assets/a.typ')).toBeNull()
  })

  it('names a sheet by its first line without heading marks and label', () => {
    expect(sheetTitle('= Einleitung <sec-einleitung>\n\nText')).toBe('Einleitung')
    expect(sheetTitle('\n\nNur Text hier.\n')).toBe('Nur Text hier.')
    expect(sheetTitle('')).toBe('')
    expect(sheetTitle(`${'wort '.repeat(40)}`).endsWith('…')).toBe(true)
  })
})

describe('autoVersionDue', () => {
  it('needs a change, and an old enough last version', () => {
    expect(autoVersionDue(null, 1000, true)).toBe(true)
    expect(autoVersionDue(null, 1000, false)).toBe(false)
    expect(autoVersionDue(0, AUTO_INTERVAL_MS - 1, true)).toBe(false)
    expect(autoVersionDue(0, AUTO_INTERVAL_MS, true)).toBe(true)
    expect(autoVersionDue(0, AUTO_INTERVAL_MS * 3, false)).toBe(false)
  })
})

describe('isBinary', () => {
  it('tells text from images and other files', () => {
    expect(isBinary(new TextEncoder().encode('= Überschrift\n\nText.'))).toBe(false)
    expect(isBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13]))).toBe(true)
    expect(isBinary(new Uint8Array(0))).toBe(false)
    expect(isBinary(new Uint8Array(3 * 1024 * 1024).fill(97))).toBe(true) // text, but too large to compare
  })
})
