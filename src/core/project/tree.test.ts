import { describe, expect, it } from 'vitest'
import { defaultManifest } from './manifest'
import {
  emptyDisk,
  exportOrder,
  findNode,
  flattenSheets,
  outsideGroups,
  structureCount,
  structureSheets,
  reconcile,
} from './tree'
import type { DiskDir, GroupNode } from './tree'

function dir(files: string[] = [], dirs: Record<string, DiskDir> = {}): DiskDir {
  return { files, dirs: new Map(Object.entries(dirs)) }
}

const disk = dir([], {
  einleitung: dir(['einleitung.typ']),
  methoden: dir(['design.typ', 'auswertung.typ'], {
    daten: dir(['interviews.typ', 'dokumente.typ']),
  }),
  notizen: dir(['ideen.typ']),
})

describe('reconcile', () => {
  it('follows the manifest order and appends unlisted items alphabetically', () => {
    const m = defaultManifest('T')
    m.order = { '': ['methoden', 'einleitung'], methoden: ['design.typ'] }
    const { root, order, warnings } = reconcile(m, disk)
    expect(root.children.map((c) => c.name)).toEqual(['methoden', 'einleitung', 'notizen'])
    const methoden = findNode(root, 'methoden') as GroupNode
    expect(methoden.children.map((c) => c.name)).toEqual(['design', 'auswertung', 'daten'])
    expect(order['methoden']).toEqual(['design.typ', 'auswertung.typ', 'daten'])
    expect(warnings.filter((w) => w.kind === 'unlisted').map((w) => w.path)).toContain('notizen')
  })

  it('keeps entries whose file is gone as missing, never dropping them', () => {
    const m = defaultManifest('T')
    m.order = { '': ['einleitung', 'weg'], einleitung: ['alt.typ', 'einleitung.typ'] }
    const { root, order, warnings } = reconcile(m, disk)
    expect(root.children.find((c) => c.name === 'weg')).toMatchObject({
      kind: 'missing',
      path: 'weg',
    })
    const einleitung = findNode(root, 'einleitung') as GroupNode
    expect(einleitung.children.map((c) => [c.kind, c.name])).toEqual([
      ['missing', 'alt'],
      ['sheet', 'einleitung'],
    ])
    expect(order['einleitung']).toEqual(['alt.typ', 'einleitung.typ'])
    expect(warnings).toContainEqual({ kind: 'missing', path: 'weg' })
  })

  it('matches order entries case-insensitively and prefers the spelling on disk', () => {
    const m = defaultManifest('T')
    m.order = { '': ['Einleitung'] }
    const { order } = reconcile(m, disk)
    expect(order['']![0]).toBe('einleitung')
  })

  it('gives a folder its icon and colour, and the project root and plain folders none', () => {
    const m = defaultManifest('T')
    m.items = { methoden: { icon: 'flask', color: 'teal' } }
    const { root } = reconcile(m, disk)
    expect(findNode(root, 'methoden')).toMatchObject({ icon: 'flask', color: 'teal' })
    expect(findNode(root, 'notizen')).toMatchObject({ icon: null, color: null })
    expect(root.icon).toBeNull()
    expect(root.color).toBeNull()
  })

  it('applies item settings and inherits the export flag downwards', () => {
    const m = defaultManifest('T')
    m.items = { notizen: { export: false }, 'methoden/design.typ': { status: 'final', goal: 500 } }
    const { root } = reconcile(m, disk)
    const notizen = findNode(root, 'notizen') as GroupNode
    expect(notizen.export).toBe(false)
    expect(notizen.children[0]).toMatchObject({ inExport: false, export: true })
    expect(findNode(root, 'methoden/design.typ')).toMatchObject({
      status: 'final',
      goal: 500,
      inExport: true,
    })
  })

  it('sums sheet counts and words over nested groups', () => {
    const { root } = reconcile(defaultManifest('T'), disk, (path) => ({
      words: path.length,
      footnoteWords: 0,
      footnotes: 0,
      footnotesAfterChapter: null,
      figures: 0,
      tables: 0,
      citations: [],
      missingCitations: [],
      citationChecks: [],
      targets: [],
      title: '',
      preview: [],
    }))
    const methoden = findNode(root, 'methoden') as GroupNode
    expect(methoden.sheetCount).toBe(4)
    expect(methoden.words).toBe(
      [
        'methoden/design.typ',
        'methoden/auswertung.typ',
        'methoden/daten/interviews.typ',
        'methoden/daten/dokumente.typ',
      ].reduce((n, p) => n + p.length, 0),
    )
  })

  it('shows settings and order lists that no order list mentions as missing, never dropping them', () => {
    const m = defaultManifest('T')
    m.order = { '': ['einleitung'], 'alt/unter': ['x.typ'] }
    m.items = { 'einleitung/alt.typ': { status: 'final' }, 'weg/a.typ': { goal: 5 } }
    const { root, order, warnings } = reconcile(m, disk)
    const einleitung = findNode(root, 'einleitung') as GroupNode
    expect(einleitung.children.map((c) => [c.kind, c.name])).toEqual([
      ['sheet', 'einleitung'],
      ['missing', 'alt'],
    ])
    expect(root.children.filter((c) => c.kind === 'missing').map((c) => c.name)).toEqual([
      'alt',
      'weg',
    ])
    expect(order['einleitung']).toEqual(['einleitung.typ', 'alt.typ'])
    expect(warnings).toContainEqual({ kind: 'missing', path: 'einleitung/alt.typ' })
    expect(warnings).toContainEqual({ kind: 'missing', path: 'weg' })
  })

  it('handles an empty project', () => {
    const { root, warnings } = reconcile(defaultManifest('T'), emptyDisk())
    expect(root.children).toEqual([])
    expect(warnings).toEqual([])
  })

  it('never reads a manifest key as a file name collision with an unrelated folder', () => {
    const m = defaultManifest('T')
    m.order = { '': ['a'], a: ['b.typ'] }
    const { root } = reconcile(m, dir([], { a: dir(['b.typ']) }))
    expect(findNode(root, 'a/b.typ')).toMatchObject({ kind: 'sheet' })
  })
})

describe('exportOrder', () => {
  it('walks depth first and skips excluded items with everything inside them', () => {
    const m = defaultManifest('T')
    m.order = {
      '': ['einleitung', 'methoden', 'notizen'],
      methoden: ['design.typ', 'daten', 'auswertung.typ'],
      'methoden/daten': ['interviews.typ', 'dokumente.typ'],
    }
    m.items = { notizen: { export: false }, 'methoden/auswertung.typ': { export: false } }
    const { root } = reconcile(m, disk)
    expect(exportOrder(root).map((s) => s.path)).toEqual([
      'einleitung/einleitung.typ',
      'methoden/design.typ',
      'methoden/daten/interviews.typ',
      'methoden/daten/dokumente.typ',
    ])
  })
})

describe('structureSheets and outsideGroups', () => {
  const build = () => {
    const m = defaultManifest('T')
    m.order = {
      '': ['einleitung', 'methoden', 'notizen'],
      methoden: ['design.typ', 'daten', 'auswertung.typ'],
      'methoden/daten': ['interviews.typ', 'dokumente.typ'],
    }
    // A folder inside a folder, and a sheet, are left out of the export; one folder is kept.
    m.items = {
      notizen: { export: false },
      'methoden/daten': { export: false },
      'methoden/auswertung.typ': { export: false },
    }
    return reconcile(m, disk).root
  }

  it('leaves the excluded folders out of the structure, and keeps an excluded sheet where it is', () => {
    const root = build()
    expect(structureSheets(root).map((r) => r.node.path)).toEqual([
      'einleitung/einleitung.typ',
      'methoden/design.typ',
      'methoden/auswertung.typ',
    ])
    expect(structureCount(root)).toBe(3)
  })

  it('lists everything of an excluded folder when it is the one chosen', () => {
    const root = build()
    const daten = findNode(root, 'methoden/daten') as GroupNode
    expect(structureSheets(daten).map((r) => r.node.path)).toEqual([
      'methoden/daten/interviews.typ',
      'methoden/daten/dokumente.typ',
    ])
  })

  it('names the outermost excluded folders, wherever they are', () => {
    expect(outsideGroups(build()).map((g) => g.path)).toEqual(['methoden/daten', 'notizen'])
    const m = defaultManifest('T')
    m.items = { methoden: { export: false }, 'methoden/daten': { export: false } }
    expect(outsideGroups(reconcile(m, disk).root).map((g) => g.path)).toEqual(['methoden'])
  })
})

describe('flattenSheets', () => {
  it('lists own sheets and those of all subgroups depth first, in manifest order', () => {
    const m = defaultManifest('T')
    m.order = {
      '': ['einleitung', 'methoden', 'notizen'],
      methoden: ['design.typ', 'daten', 'auswertung.typ'],
      'methoden/daten': ['interviews.typ', 'dokumente.typ'],
    }
    const { root } = reconcile(m, disk)
    expect(flattenSheets(root).map((r) => r.node.path)).toEqual([
      'einleitung/einleitung.typ',
      'methoden/design.typ',
      'methoden/daten/interviews.typ',
      'methoden/daten/dokumente.typ',
      'methoden/auswertung.typ',
      'notizen/ideen.typ',
    ])
    const methoden = findNode(root, 'methoden') as GroupNode
    expect(flattenSheets(methoden).map((r) => [r.node.path, r.folder])).toEqual([
      ['methoden/design.typ', 'methoden'],
      ['methoden/daten/interviews.typ', 'methoden/daten'],
      ['methoden/daten/dokumente.typ', 'methoden/daten'],
      ['methoden/auswertung.typ', 'methoden'],
    ])
  })

  it('includes missing entries and skips empty groups', () => {
    const m = defaultManifest('T')
    m.order = { '': ['einleitung', 'weg', 'leer'], einleitung: ['alt.typ', 'einleitung.typ'] }
    const withEmpty: DiskDir = { files: [], dirs: new Map([...disk.dirs, ['leer', dir()]]) }
    const rows = flattenSheets(reconcile(m, withEmpty).root)
    expect(rows.map((r) => [r.node.kind, r.node.path])).toContainEqual(['missing', 'weg'])
    expect(rows.map((r) => [r.node.kind, r.node.path])).toContainEqual([
      'missing',
      'einleitung/alt.typ',
    ])
    expect(rows.some((r) => r.folder === 'leer')).toBe(false)
  })
})
