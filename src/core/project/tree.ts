import type { Manifest, Status } from './manifest'
import {
  compareNames,
  isSameOrBelow,
  isSheetFile,
  join,
  MATERIAL,
  nameKey,
  rebase,
  sheetTitle,
} from './paths'

/** What is on disk below content/. Folder names and `.typ` file names only. */
export interface DiskDir {
  dirs: Map<string, DiskDir>
  files: string[]
}

export const emptyDisk = (): DiskDir => ({ dirs: new Map(), files: [] })

export interface SheetStats {
  words: number
  /** Words inside footnotes, counted separately from the body. */
  footnoteWords: number
  /** What names the sheet in lists: its first heading, or its first words. Empty for an empty sheet. */
  title: string
  /** The first few lines, for the sheet row: `[level, text]`, level 0 for a paragraph. */
  preview: [level: number, text: string][]
  /** Footnotes in the sheet. With the next field, this decides the numbering of later sheets. */
  footnotes: number
  /** Footnotes after the sheet's last level-1 heading, or null when it has none. */
  footnotesAfterChapter: number | null
  /** Numbered figures (images with a caption) in the sheet, for numbering the later sheets. */
  figures: number
  /** Tables with a caption or in a figure (numbered), for numbering the later sheets. */
  tables: number
  /** Every citation in the sheet: the work's key and where it starts. */
  citations: [key: string, at: number][]
  /** Where a place that still needs a citation is marked, and where a citation is marked to check. */
  missingCitations: number[]
  citationChecks: number[]
  /** What a cross-reference can point at, in text order: see `targets.ts`. */
  targets: SheetTarget[]
}

/** A numbered thing of a sheet: kind, label ('' without one), level, title, start, and label position. */
export type SheetTarget = [
  kind: 'sec' | 'fig' | 'tbl' | 'eq',
  label: string,
  level: number,
  title: string,
  at: number,
  labelAt: number,
]

export const NO_STATS: SheetStats = {
  words: 0,
  footnoteWords: 0,
  title: '',
  preview: [],
  footnotes: 0,
  footnotesAfterChapter: null,
  figures: 0,
  tables: 0,
  citations: [],
  missingCitations: [],
  citationChecks: [],
  targets: [],
}

interface NodeBase {
  /** Path inside content/, for example "methoden/design.typ". */
  path: string
  /** Display name: the folder name, or the file name without extension. */
  name: string
  /** Own export flag. */
  export: boolean
  /** False when this item or one of its ancestors is excluded from the export. */
  inExport: boolean
}

export interface SheetNode extends NodeBase, SheetStats {
  kind: 'sheet'
  status: Status
  goal: number | null
}

export interface GroupNode extends NodeBase {
  kind: 'group'
  /** Icon id chosen for the folder, or null for the plain folder. */
  icon: string | null
  /** Colour id of the folder icon, or null for the plain grey. */
  color: string | null
  children: TreeNode[]
  /** Sheets in this group and below. */
  sheetCount: number
  /** Words in this group and below. */
  words: number
}

/** An entry of the manifest's order list whose file or folder is gone. Kept until the writer decides. */
export interface MissingNode {
  kind: 'missing'
  path: string
  name: string
}

export type TreeNode = SheetNode | GroupNode | MissingNode

export type Warning =
  | { kind: 'missing'; path: string }
  | { kind: 'unlisted'; path: string }
  | { kind: 'manifest'; message: string }

export interface Reconciled {
  root: GroupNode
  /** The effective order of every folder: manifest order, missing entries kept, new items appended. */
  order: Record<string, string[]>
  warnings: Warning[]
}

/**
 * Merges the manifest with what is on disk. Pure, and it never drops anything:
 * - on disk but not in the order list: appended at the end of its folder,
 * - in the order list but not on disk: kept and marked missing.
 */
export function reconcile(
  manifest: Manifest,
  disk: DiskDir,
  statsOf: (path: string) => SheetStats = () => NO_STATS,
): Reconciled {
  const order: Record<string, string[]> = {}
  const warnings: Warning[] = []

  const build = (folder: string, dir: DiskDir | null, parentInExport: boolean): GroupNode => {
    const onDisk = new Map<string, 'dir' | 'file'>()
    // The material stands beside the document, not in its order lists (it is added last, below).
    for (const name of dir?.dirs.keys() ?? [])
      if (!(folder === '' && name === MATERIAL)) onDisk.set(name, 'dir')
    for (const name of dir?.files ?? []) onDisk.set(name, 'file')

    const listed = manifest.order[folder] ?? []
    const diskByKey = new Map([...onDisk.keys()].map((name) => [nameKey(name), name]))
    const seen = new Set<string>()
    const entries: string[] = []
    // Manifest entries first, matched case-insensitively and with the on-disk spelling winning.
    for (const entry of listed) {
      const actual = onDisk.has(entry) ? entry : (diskByKey.get(nameKey(entry)) ?? entry)
      if (seen.has(actual)) continue
      seen.add(actual)
      entries.push(actual)
    }
    const unlisted = [...onDisk.keys()].filter((name) => !seen.has(name)).sort(compareNames)
    for (const name of unlisted) {
      entries.push(name)
      warnings.push({ kind: 'unlisted', path: join(folder, name) })
    }
    // Settings and order lists can point at items that appear in no order list. They are entries
    // too: show them as missing, so the writer can relink or remove them instead of losing track.
    const known = new Set(entries.map(nameKey))
    const prefix = folder === '' ? '' : `${folder}/`
    const orphans = new Set<string>()
    for (const key of [...Object.keys(manifest.items), ...Object.keys(manifest.order)]) {
      if (key === '' || !key.startsWith(prefix)) continue
      const first = key.slice(prefix.length).split('/')[0] ?? ''
      if (folder === '' && first === MATERIAL) continue
      if (first !== '' && !known.has(nameKey(first))) orphans.add(first)
    }
    for (const name of [...orphans].sort(compareNames)) {
      entries.push(name)
      known.add(nameKey(name))
    }
    order[folder] = entries

    const children: TreeNode[] = []
    let sheetCount = 0
    let words = 0
    for (const name of entries) {
      const path = join(folder, name)
      const kind = onDisk.get(name)
      const settings = manifest.items[path] ?? {}
      const own = settings.export !== false
      const inExport = parentInExport && own
      if (kind === 'dir') {
        const group = build(path, dir?.dirs.get(name) ?? null, inExport)
        group.export = own
        group.icon = settings.icon ?? null
        group.color = settings.color ?? null
        children.push(group)
        sheetCount += group.sheetCount
        words += group.words
      } else if (kind === 'file') {
        const stats = statsOf(path)
        children.push({
          kind: 'sheet',
          path,
          name: sheetTitle(name),
          status: settings.status ?? 'draft',
          goal: settings.goal ?? null,
          export: own,
          inExport,
          ...stats,
        })
        sheetCount += 1
        words += stats.words
      } else {
        children.push({ kind: 'missing', path, name: isSheetFile(name) ? sheetTitle(name) : name })
        warnings.push({ kind: 'missing', path })
      }
    }
    // The material: a group of its own after the document's, which counts for nothing in it and
    // is never in the export (its folders keep the settings they have, but are outside).
    const material = folder === '' ? dir?.dirs.get(MATERIAL) : undefined
    if (material) {
      const group = build(MATERIAL, material, false)
      group.export = false
      children.push(group)
    }
    return {
      kind: 'group',
      path: folder,
      name: folder === '' ? '' : (folder.split('/').pop() ?? ''),
      export: true,
      icon: null,
      color: null,
      inExport: parentInExport,
      children,
      sheetCount,
      words,
    }
  }

  return { root: build('', disk, true), order, warnings }
}

/** Sheets in export order: depth first, skipping excluded items and everything inside them. */
export function exportOrder(root: GroupNode): SheetNode[] {
  const out: SheetNode[] = []
  const walk = (group: GroupNode): void => {
    for (const child of group.children) {
      if (child.kind === 'group') {
        if (child.export) walk(child)
      } else if (child.kind === 'sheet' && child.export) out.push(child)
    }
  }
  walk(root)
  return out
}

/**
 * What `flattenSheets` and `findNode` need of a group. The tree here and the snapshot's copy of it
 * that the renderer gets (`@shared/project`) both have this shape, so the two functions serve both
 * and return nodes of the tree they were given.
 */
export interface GroupShape {
  kind: 'group'
  path: string
  children: readonly (GroupShape | { kind: 'sheet' | 'missing'; path: string })[]
}

/** A node of the tree that `G` is the root of. */
type NodeOf<G extends GroupShape> = G | G['children'][number]
/** A sheet or missing entry of the tree that `G` is the root of. */
type LeafOf<G extends GroupShape> = Exclude<G['children'][number], { kind: 'group' }>

export interface FlatRow<Leaf = SheetNode | MissingNode> {
  node: Leaf
  /** The group the item lives in (path inside content/). */
  folder: string
}

/**
 * Every sheet (and missing entry) of a group and of all groups below it, depth first in the order
 * of the manifest. This is the list the sheets column shows: selecting a parent group shows its own
 * sheets and those of its subgroups.
 */
export function flattenSheets<G extends GroupShape>(group: G): FlatRow<LeafOf<G>>[] {
  const out: FlatRow<LeafOf<G>>[] = []
  const walk = (current: GroupShape): void => {
    for (const child of current.children) {
      if (child.kind === 'group') walk(child)
      else out.push({ node: child as LeafOf<G>, folder: current.path })
    }
  }
  walk(group)
  return out
}

/** A group with the flags of the export, which is all `structureSheets` and `outsideGroups` need of it. */
export interface ExportGroupShape extends GroupShape {
  export: boolean
  inExport: boolean
  children: readonly (ExportGroupShape | { kind: 'sheet' | 'missing'; path: string })[]
}

/**
 * The sheets that belong to a group in the structure: those of the group and of the groups below it,
 * except the groups that are excluded from the export. Those stand outside the structure (see
 * `outsideGroups`) and are listed when one of them is chosen: in an excluded group, nothing is left
 * out. A sheet that is excluded itself stays: it is a scrapsheet in its place.
 */
export function structureSheets<G extends ExportGroupShape>(group: G): FlatRow<LeafOf<G>>[] {
  const out: FlatRow<LeafOf<G>>[] = []
  const walk = (current: ExportGroupShape): void => {
    for (const child of current.children) {
      if (child.kind === 'group') {
        if (current.inExport && !child.export) continue
        walk(child)
      } else out.push({ node: child as LeafOf<G>, folder: current.path })
    }
  }
  walk(group)
  return out
}

/**
 * The folders that stand outside the structure: the outermost excluded ones, wherever they are on
 * disk, in the order of the tree. Everything inside one of them is excluded with it.
 */
export function outsideGroups<G extends ExportGroupShape>(root: G): ExportGroupShape[] {
  const out: ExportGroupShape[] = []
  const walk = (group: ExportGroupShape): void => {
    for (const child of group.children) {
      if (child.kind !== 'group') continue
      if (child.export) walk(child)
      else out.push(child)
    }
  }
  walk(root)
  return out
}

/** Sheets of a group and below it that are in the export or stand in the structure, for counting. */
export function structureCount(group: ExportGroupShape): number {
  return structureSheets(group).filter((row) => row.node.kind === 'sheet').length
}

export function findNode<G extends GroupShape>(root: G, path: string): NodeOf<G> | null {
  if (path === '') return root
  let node: NodeOf<GroupShape> = root
  for (const segment of path.split('/')) {
    if (node.kind !== 'group') return null
    const next: NodeOf<GroupShape> | undefined = node.children.find(
      (c) => c.path.split('/').pop() === segment,
    )
    if (!next) return null
    node = next
  }
  return node as NodeOf<G>
}

/** Rewrites every key and entry of `manifest.order` and `manifest.items` after `from` became `to`. */
export function rewriteKeys(
  order: Record<string, string[]>,
  items: Manifest['items'],
  from: string,
  to: string,
): { order: Record<string, string[]>; items: Manifest['items'] } {
  const newOrder: Record<string, string[]> = {}
  for (const [folder, entries] of Object.entries(order)) {
    newOrder[isSameOrBelow(folder, from) && folder !== '' ? rebase(folder, from, to) : folder] =
      entries
  }
  const newItems: Manifest['items'] = {}
  for (const [path, settings] of Object.entries(items)) {
    newItems[isSameOrBelow(path, from) ? rebase(path, from, to) : path] = settings
  }
  return { order: newOrder, items: newItems }
}
