import { describe, expect, it } from 'vitest'
import { defaultManifest } from './manifest'
import type { Manifest } from './manifest'
import { addEntry, moveEntry, patchItem, removeEntry } from './operations'

function sample(): Manifest {
  const m = defaultManifest('T')
  m.order = {
    '': ['einleitung', 'methoden', 'notizen'],
    einleitung: ['a.typ'],
    methoden: ['design.typ', 'daten', 'auswertung.typ'],
    'methoden/daten': ['interviews.typ', 'dokumente.typ'],
  }
  m.items = {
    'methoden/design.typ': { status: 'revised', goal: 1200 },
    'methoden/daten/interviews.typ': { status: 'final' },
    notizen: { export: false },
  }
  return m
}

describe('moveEntry', () => {
  it('renames a sheet in place, keeping position and settings', () => {
    const m = moveEntry(sample(), 'methoden/design.typ', 'methoden/entwurf.typ', 0)
    expect(m.order['methoden']).toEqual(['entwurf.typ', 'daten', 'auswertung.typ'])
    expect(m.items['methoden/entwurf.typ']).toEqual({ status: 'revised', goal: 1200 })
    expect(m.items['methoden/design.typ']).toBeUndefined()
  })

  it('renames a group and rewrites everything below it', () => {
    const m = moveEntry(sample(), 'methoden', 'verfahren', 1)
    expect(m.order['']).toEqual(['einleitung', 'verfahren', 'notizen'])
    expect(m.order['verfahren']).toEqual(['design.typ', 'daten', 'auswertung.typ'])
    expect(m.order['verfahren/daten']).toEqual(['interviews.typ', 'dokumente.typ'])
    expect(m.order['methoden']).toBeUndefined()
    expect(m.items['verfahren/daten/interviews.typ']).toEqual({ status: 'final' })
    expect(Object.keys(m.items).some((k) => k.startsWith('methoden'))).toBe(false)
  })

  it('moves a sheet into another group at an index', () => {
    const m = moveEntry(sample(), 'methoden/design.typ', 'einleitung/design.typ', 0)
    expect(m.order['einleitung']).toEqual(['design.typ', 'a.typ'])
    expect(m.order['methoden']).toEqual(['daten', 'auswertung.typ'])
    expect(m.items['einleitung/design.typ']).toEqual({ status: 'revised', goal: 1200 })
  })

  it('reorders within a folder', () => {
    const m = moveEntry(sample(), 'methoden/auswertung.typ', 'methoden/auswertung.typ', 0)
    expect(m.order['methoden']).toEqual(['auswertung.typ', 'design.typ', 'daten'])
  })

  it('does not mutate its input', () => {
    const before = sample()
    moveEntry(before, 'methoden', 'verfahren')
    expect(before).toEqual(sample())
  })
})

describe('removeEntry', () => {
  it('removes a group with its order lists and settings, and its entry in the parent', () => {
    const m = removeEntry(sample(), 'methoden/daten')
    expect(m.order['methoden']).toEqual(['design.typ', 'auswertung.typ'])
    expect(m.order['methoden/daten']).toBeUndefined()
    expect(m.items['methoden/daten/interviews.typ']).toBeUndefined()
    expect(m.items['methoden/design.typ']).toBeDefined()
  })
})

describe('addEntry and patchItem', () => {
  it('inserts at an index and never duplicates', () => {
    const m = addEntry(addEntry(sample(), 'einleitung', 'b.typ', 0), 'einleitung', 'b.typ')
    expect(m.order['einleitung']).toEqual(['a.typ', 'b.typ'])
  })

  it('resets to defaults and drops empty settings', () => {
    let m = patchItem(sample(), 'notizen', { export: undefined })
    expect(m.items['notizen']).toBeUndefined()
    m = patchItem(m, 'a.typ', { status: 'final', goal: 10 })
    expect(m.items['a.typ']).toEqual({ status: 'final', goal: 10 })
    m = patchItem(m, 'a.typ', { goal: undefined })
    expect(m.items['a.typ']).toEqual({ status: 'final' })
    m = patchItem(m, 'methoden', { icon: 'flask' })
    expect(m.items['methoden']).toEqual({ icon: 'flask' })
    m = patchItem(m, 'methoden', { icon: undefined })
    expect(m.items['methoden']).toBeUndefined()
  })
})
