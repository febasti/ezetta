import type { ItemSettings, Manifest } from './manifest'
import { basename, dirname, isSameOrBelow } from './paths'
import { rewriteKeys } from './tree'

/** Pure edits of the manifest. Each takes the manifest whose `order` is already the effective
 * order (see `Reconciled.order`) and returns a new one. The file system is not touched here. */

export const withOrder = (manifest: Manifest, order: Record<string, string[]>): Manifest => ({
  ...manifest,
  order: Object.fromEntries(Object.entries(order).map(([k, v]) => [k, [...v]])),
})

function insertAt(list: string[], name: string, index: number | undefined): string[] {
  const without = list.filter((entry) => entry !== name)
  const at = index === undefined ? without.length : Math.max(0, Math.min(index, without.length))
  return [...without.slice(0, at), name, ...without.slice(at)]
}

/** Appends or inserts a new entry into a folder's order list. */
export function addEntry(
  manifest: Manifest,
  folder: string,
  name: string,
  index?: number,
): Manifest {
  return {
    ...manifest,
    order: { ...manifest.order, [folder]: insertAt(manifest.order[folder] ?? [], name, index) },
  }
}

/** Moves, renames, or reorders `from` to the full path `to`, at `index` in the target folder (the
 * end when omitted). Item settings and the order lists of everything below follow. */
export function moveEntry(manifest: Manifest, from: string, to: string, index?: number): Manifest {
  const fromParent = dirname(from)
  const toParent = dirname(to)
  const order = { ...manifest.order }
  order[fromParent] = (order[fromParent] ?? []).filter((entry) => entry !== basename(from))
  const rewritten = rewriteKeys(order, manifest.items, from, to)
  rewritten.order[toParent] = insertAt(rewritten.order[toParent] ?? [], basename(to), index)
  return { ...manifest, order: rewritten.order, items: rewritten.items }
}

/** Removes an entry, everything below it, and the settings of all of it. */
export function removeEntry(manifest: Manifest, path: string): Manifest {
  const parent = dirname(path)
  const order: Record<string, string[]> = {}
  for (const [folder, entries] of Object.entries(manifest.order)) {
    if (folder !== '' && isSameOrBelow(folder, path)) continue
    order[folder] = folder === parent ? entries.filter((e) => e !== basename(path)) : entries
  }
  const items: Manifest['items'] = {}
  for (const [key, settings] of Object.entries(manifest.items)) {
    if (!isSameOrBelow(key, path)) items[key] = settings
  }
  return { ...manifest, order, items }
}

/** Merges a settings patch into an item. `undefined` values reset to the default. */
export function patchItem(
  manifest: Manifest,
  path: string,
  patch: Partial<Pick<ItemSettings, 'status' | 'goal' | 'export' | 'icon' | 'color'>>,
): Manifest {
  const next: ItemSettings = { ...manifest.items[path] }
  for (const key of ['status', 'goal', 'export', 'icon', 'color'] as const) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined) delete next[key]
    else Object.assign(next, { [key]: value })
  }
  const items = { ...manifest.items }
  if (Object.keys(next).length === 0) delete items[path]
  else items[path] = next
  return { ...manifest, items }
}
