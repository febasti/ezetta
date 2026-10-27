import { isSameOrBelow, rebase, dirname, basename } from '@core/project/paths'
import { MATERIAL } from '@core/project/paths'
import { findNode, flattenSheets, outsideGroups, structureSheets } from '@core/project/tree'
import { offsetsAfter } from '@core/typst/footnotes'
import type { QuoteStyle } from '@core/typst/quoteStyle'
import { fromTuple } from '@core/typst/targets'
import type { SheetTargets } from '@core/typst/targets'
import type { FootnoteOffsets, FootnoteSummary } from '@core/typst/footnotes'
import type {
  GroupNodeDto,
  SheetNodeDto,
  SnapshotDto,
  StatusDto,
  TreeNodeDto,
} from '@shared/project'
import { i18n } from '../../i18n/i18n.svelte'
import { call } from '../../lib/api'
import type { DropSlot } from '../../lib/dropSlot'
import { confirmDialog, promptDialog } from '../../lib/ui.svelte'
import { bibliography } from '../bibliography/bibliography.svelte'
import { editor } from '../editor/editorSession.svelte'

const asGroup = (node: TreeNodeDto | null): GroupNodeDto | null =>
  node?.kind === 'group' ? node : null

/** Name that does not clash with existing entries of the same folder (case-insensitive). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const key = (name: string): string => name.normalize('NFC').toLowerCase()
  const isTaken = (name: string): boolean => taken.some((t) => key(t) === key(name))
  if (!isTaken(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`
    if (!isTaken(candidate)) return candidate
  }
}

class ProjectStore {
  /** Replaced as a whole by every update, never changed in place, so it is not made deeply reactive (160 sheets of nested data would be proxied on every access). */
  snapshot = $state.raw<SnapshotDto | null>(null)
  /** Group shown in the sheets column ("" is the top level). */
  selectedGroup = $state('')
  /** Selected rows of the sheets column. */
  selection = $state<string[]>([])
  /** The row being renamed inline. */
  renaming = $state<string | null>(null)
  recent = $state<{ path: string; title: string }[]>([])
  ready = $state(false)
  /** What the editor area shows: one sheet for editing, or the continuous read-only view. */
  mode = $state<'editor' | 'flow'>('editor')
  /** The continuous view shows the selected group, or the sheets selected with Cmd or Shift. */
  flowKind = $state<'group' | 'selection'>('group')
  /** Bumped when files changed on disk behind the app, so the continuous view reloads. */
  contentStamp = $state(0)

  private anchor: string | null = null

  /** What a cross-reference can point at, sheet by sheet in project order (from the sheet statistics). */
  targetSheets = $derived.by((): SheetTargets[] =>
    this.snapshot
      ? flattenSheets(this.snapshot.tree).flatMap(({ node }) =>
          node.kind === 'sheet'
            ? [
                {
                  path: node.path,
                  inExport: node.inExport,
                  targets: node.targets.map(fromTuple),
                },
              ]
            : [],
        )
      : [],
  )

  currentGroup = $derived(
    asGroup(this.snapshot ? findNode(this.snapshot.tree, this.selectedGroup) : null),
  )

  /**
   * What the sheets column lists: the group's own sheets and those of all groups below it, except
   * the folders that are excluded from the export, which stand outside (a chosen one lists all of its own).
   */
  flatRows = $derived(this.currentGroup ? structureSheets(this.currentGroup) : [])

  /** The folders of the material, the top level of the section beside the document. */
  materialFolders = $derived.by((): GroupNodeDto[] => {
    const material = this.snapshot ? findNode(this.snapshot.tree, MATERIAL) : null
    return material?.kind === 'group'
      ? material.children.filter((c): c is GroupNodeDto => c.kind === 'group')
      : []
  })

  /**
   * Folders marked as not in the export in the document itself (a project written by hand: the
   * app moves such a folder into the material when it opens the project), which stand outside too.
   */
  markedFolders = $derived(
    this.snapshot ? outsideGroups(this.snapshot.tree).filter((g) => g.path !== MATERIAL) : [],
  )

  /** Everything the section of the material shows, in its order. */
  outside = $derived<GroupNodeDto[]>([
    ...this.materialFolders,
    ...(this.markedFolders as GroupNodeDto[]),
  ])

  /**
   * Sheets in the continuous view, in list order. A folder shows its sheets without the scrapsheets
   * (sheets kept out of the export, which are no part of the text); sheets the writer chose are shown.
   */
  flowPaths = $derived(
    this.flatRows.flatMap((r) =>
      r.node.kind === 'sheet' &&
      (this.flowKind === 'group' ? r.node.export : this.selection.includes(r.node.path))
        ? [r.node.path]
        : [],
    ),
  )

  get tree(): GroupNodeDto | null {
    return this.snapshot?.tree ?? null
  }

  node(path: string): TreeNodeDto | null {
    return this.snapshot ? findNode(this.snapshot.tree, path) : null
  }

  /** Sets up subscriptions and loads what is already open (the project of the last session). */
  async init(): Promise<void> {
    window.api.on.project.changed(({ snapshot, externallyChanged }) => {
      this.apply(snapshot)
      if (externallyChanged.length > 0) this.contentStamp += 1
      editor.onProjectChanged(externallyChanged, (path) => this.node(path)?.kind === 'sheet')
    })
    window.api.on.app.flushRequested(() => {
      void editor.flush().finally(() => void window.api.app.flushDone({}))
    })
    const current = await call(window.api.project.current({}))
    if (current?.snapshot) this.apply(current.snapshot, true)
    await this.refreshRecent()
    this.ready = true
  }

  async refreshRecent(): Promise<void> {
    const result = await call(window.api.project.recent({}))
    if (result) this.recent = result.projects
  }

  /** Takes the targets of a sheet that was written from here, ahead of the snapshot the watcher sends. */
  noteTargets(path: string, targets: SheetNodeDto['targets']): void {
    if (!this.snapshot) return
    const patch = (node: TreeNodeDto): TreeNodeDto =>
      node.kind === 'group'
        ? { ...node, children: node.children.map(patch) }
        : node.kind === 'sheet' && node.path === path
          ? { ...node, targets }
          : node
    this.snapshot = { ...this.snapshot, tree: patch(this.snapshot.tree) as GroupNodeDto }
  }

  /** Takes a newer snapshot. A snapshot with a lower revision than the current one is stale. */
  apply(snapshot: SnapshotDto, replace = false): void {
    if (!replace && this.snapshot && snapshot.revision < this.snapshot.revision) return
    this.snapshot = snapshot
    void bibliography.sync(snapshot.bibliographyStamp)
    if (!asGroup(this.node(this.selectedGroup))) this.selectedGroup = ''
    this.selection = this.selection.filter((p) => this.node(p) !== null)
    if (this.renaming !== null && this.node(this.renaming) === null) this.renaming = null
  }

  // --- projects -------------------------------------------------------------------------------

  /** Makes a project that the main process opened (a restored backup) the open one. */
  async adopt(snapshot: SnapshotDto | null | undefined): Promise<void> {
    if (!snapshot) return
    await editor.close()
    this.selectedGroup = ''
    this.selection = []
    this.renaming = null
    this.mode = 'editor'
    this.apply(snapshot, true)
    await this.refreshRecent()
  }

  async createProject(): Promise<void> {
    await editor.flush()
    const result = await call(
      window.api.project.create({
        language: i18n.locale,
        dialogTitle: i18n.t('dialog.newProject'),
      }),
    )
    await this.adopt(result?.snapshot)
  }

  async openProject(): Promise<void> {
    await editor.flush()
    const result = await call(
      window.api.project.open({ dialogTitle: i18n.t('dialog.openProject') }),
    )
    await this.adopt(result?.snapshot)
  }

  async openRecent(path: string): Promise<void> {
    await editor.flush()
    const result = await call(window.api.project.openRecent({ path }))
    await this.adopt(result?.snapshot)
    await this.refreshRecent()
  }

  async closeProject(): Promise<void> {
    await editor.close()
    await call(window.api.project.close({}))
    this.snapshot = null
    bibliography.clear()
    this.mode = 'editor'
    this.selection = []
    this.selectedGroup = ''
    await this.refreshRecent()
  }

  // --- selection ------------------------------------------------------------------------------

  selectGroup(path: string): void {
    this.selectedGroup = path
    this.selection = []
    this.anchor = null
    void this.enterFlow('group')
  }

  /** Shows the continuous view. Unsaved text is written first and the editor is released, so the
   * view reads current files and coming back to a sheet reads them fresh. */
  async enterFlow(kind: 'group' | 'selection'): Promise<void> {
    this.flowKind = kind
    if (this.mode !== 'flow') await editor.close()
    this.mode = 'flow'
  }

  /** A click on a sheet row: one sheet opens for editing, several show together. */
  async clickRow(path: string, how: { extend?: boolean; toggle?: boolean } = {}): Promise<void> {
    this.select(path, how)
    const sheets = this.selection.filter((p) => this.node(p)?.kind === 'sheet')
    if (sheets.length > 1) await this.enterFlow('selection')
    else if (sheets.length === 1) await this.openSheet(sheets[0]!)
    else await this.enterFlow('group')
  }

  /** Selects a row of the sheets column. `extend` is shift, `toggle` is cmd or ctrl. */
  select(path: string, how: { extend?: boolean; toggle?: boolean } = {}): void {
    const rows = this.flatRows.map((r) => r.node.path)
    if (how.extend && this.anchor !== null && rows.includes(this.anchor)) {
      const [a, b] = [rows.indexOf(this.anchor), rows.indexOf(path)]
      this.selection = rows.slice(Math.min(a, b), Math.max(a, b) + 1)
    } else if (how.toggle) {
      this.selection = this.selection.includes(path)
        ? this.selection.filter((p) => p !== path)
        : [...this.selection, path]
      this.anchor = path
    } else {
      this.selection = [path]
      this.anchor = path
    }
  }

  /** Opens one sheet for editing, optionally with the cursor at a file offset. */
  async openSheet(path: string, cursor?: number): Promise<void> {
    this.mode = 'editor'
    await editor.open(path, cursor)
  }

  // --- structure --------------------------------------------------------------------------------

  private siblingNames(parent: string): string[] {
    return (asGroup(this.node(parent))?.children ?? []).map((c) => c.name)
  }

  /** How a sheet is named in lists and messages: its first heading or first words, never its file. */
  sheetLabel(path: string): string {
    const node = this.node(path)
    if (node?.kind === 'sheet') return node.title || i18n.t('sidebar.emptySheet')
    return node?.name ?? basename(path)
  }

  /** Makes an empty sheet (its file gets a generated name) and opens it, ready to type in. */
  async createSheet(parent = this.selectedGroup): Promise<void> {
    const result = await call(window.api.project.createSheet({ parent }))
    if (!result) return
    this.apply(result.snapshot)
    this.selectedGroup = parent
    this.selection = [result.path]
    await this.openSheet(result.path)
  }

  async createGroup(parent = this.selectedGroup): Promise<void> {
    const name = uniqueName(i18n.t('sidebar.defaultGroupName'), this.siblingNames(parent))
    const result = await call(window.api.project.createGroup({ parent, name }))
    if (!result) return
    this.apply(result.snapshot)
    this.renaming = result.path
    if (parent === this.selectedGroup) this.selection = [result.path]
  }

  /** Renames the project (the title in project.toml). The folder on disk keeps its name. */
  async renameProject(title: string): Promise<void> {
    const trimmed = title.trim()
    if (trimmed === '' || trimmed === this.snapshot?.title) return
    const result = await call(window.api.project.setTitle({ title: trimmed }))
    if (result) this.apply(result.snapshot)
  }

  /** Asks for a new project name in a dialog (used when the groups column is hidden). */
  async promptRenameProject(): Promise<void> {
    const answer = await promptDialog({
      title: i18n.t('prompt.projectTitle'),
      label: i18n.t('prompt.projectTitleLabel'),
      initial: this.snapshot?.title ?? '',
    })
    if (answer !== null) await this.renameProject(answer)
  }

  async commitRename(path: string, name: string): Promise<void> {
    this.renaming = null
    if (path === '') return this.renameProject(name)
    const node = this.node(path)
    const trimmed = name.trim()
    if (!node || trimmed === '' || trimmed === node.name) return
    await editor.flush()
    const result = await call(window.api.project.rename({ path, name: trimmed }))
    if (!result) return
    this.remap(path, result.path)
    this.apply(result.snapshot)
  }

  /** Keeps selection, the sheets column, and the editor pointing at the same things after a move. */
  private remap(from: string, to: string): void {
    if (from === to) return
    editor.pathChanged(from, to)
    this.selection = this.selection.map((p) => (isSameOrBelow(p, from) ? rebase(p, from, to) : p))
    if (isSameOrBelow(this.selectedGroup, from))
      this.selectedGroup = rebase(this.selectedGroup, from, to)
  }

  async remove(paths: readonly string[]): Promise<void> {
    const nodes = paths.map((p) => this.node(p)).filter((n): n is TreeNodeDto => n !== null)
    if (nodes.length === 0) return
    const first = nodes[0]!
    const message =
      nodes.length > 1
        ? i18n.t('confirm.deleteMany', { count: nodes.length })
        : first.kind === 'group'
          ? i18n.t('confirm.deleteGroup', { count: first.sheetCount })
          : i18n.t('confirm.deleteSheet')
    const confirmed = await confirmDialog({
      title:
        nodes.length > 1
          ? i18n.t('confirm.deleteManyTitle', { count: nodes.length })
          : i18n.t('confirm.deleteTitle', {
              name: first.kind === 'sheet' ? this.sheetLabel(first.path) : first.name,
            }),
      message,
      confirmLabel: i18n.t('confirm.delete'),
    })
    if (!confirmed) return
    for (const node of nodes) {
      if (editor.isAffected(node.path)) await editor.close()
      const result = await call(window.api.project.remove({ path: node.path }))
      if (!result) return
      this.apply(result.snapshot)
    }
    this.selection = []
  }

  /** Moves items into `toParent`. `index` is the position among the siblings that stay behind. */
  async move(paths: readonly string[], toParent: string, index?: number): Promise<void> {
    await editor.flush()
    let offset = 0
    for (const path of paths) {
      if (isSameOrBelow(toParent, path)) continue // a group cannot move into itself
      const at = index === undefined ? undefined : index + offset
      const result = await call(
        window.api.project.move({ path, toParent, ...(at === undefined ? {} : { index: at }) }),
      )
      if (!result) return
      this.remap(path, result.path)
      this.apply(result.snapshot)
      offset += 1
    }
  }

  /** Moves paths to a place in the list of sheets: before or after a row, or to the group's end. */
  async dropAt(paths: readonly string[], slot: DropSlot): Promise<void> {
    if ('end' in slot) return this.move(paths, this.selectedGroup)
    if (paths.some((p) => isSameOrBelow(slot.path, p))) return
    const parent = dirname(slot.path)
    const siblings = this.siblingsWithout(parent, paths)
    await this.move(
      paths,
      parent,
      siblings.indexOf(slot.path) + (slot.position === 'after' ? 1 : 0),
    )
  }

  /** Children of a folder as they stay after `moving` paths are taken out: the base for indexes. */
  siblingsWithout(parent: string, moving: readonly string[]): string[] {
    return (asGroup(this.node(parent))?.children ?? [])
      .filter((c) => !moving.includes(c.path))
      .map((c) => c.path)
  }

  async setStatus(paths: readonly string[], status: StatusDto): Promise<void> {
    for (const path of paths) {
      const result = await call(
        window.api.project.setItem({ path, status: status === 'draft' ? null : status }),
      )
      if (result) this.apply(result.snapshot)
    }
  }

  async setExport(paths: readonly string[], included: boolean): Promise<void> {
    for (const path of paths) {
      const result = await call(
        window.api.project.setItem({ path, export: included ? null : false }),
      )
      if (result) this.apply(result.snapshot)
    }
  }

  /** Sets the symbol of a folder in the sidebar. `null` goes back to the plain folder. */
  async setIcon(path: string, icon: string | null): Promise<void> {
    const result = await call(window.api.project.setItem({ path, icon }))
    if (result) this.apply(result.snapshot)
  }

  /** Sets the colour of a folder's symbol. `null` goes back to the plain grey. */
  async setColor(path: string, color: string | null): Promise<void> {
    const result = await call(window.api.project.setItem({ path, color }))
    if (result) this.apply(result.snapshot)
  }

  async setGoal(path: string): Promise<void> {
    const node = this.node(path)
    if (node?.kind !== 'sheet') return
    const answer = await promptDialog({
      title: i18n.t('prompt.goalTitle'),
      label: i18n.t('prompt.goalLabel'),
      initial: node.goal === null ? '' : String(node.goal),
      inputMode: 'numeric',
    })
    if (answer === null) return
    const words = Number.parseInt(answer.replaceAll(/[^\d]/g, ''), 10)
    const result = await call(
      window.api.project.setItem({
        path,
        goal: Number.isFinite(words) && words > 0 ? words : null,
      }),
    )
    if (result) this.apply(result.snapshot)
  }

  async setFootnoteRestart(restart: 'continuous' | 'chapter'): Promise<void> {
    const result = await call(window.api.project.setFootnoteRestart({ restart }))
    if (result) this.apply(result.snapshot)
  }

  /** Asks for a .bib file with the system dialog and makes it the project's bibliography. */
  async chooseBibliography(): Promise<void> {
    const result = await call(
      window.api.project.chooseBibliography({
        dialogTitle: i18n.t('dialog.chooseBibliography'),
        filterName: i18n.t('dialog.bibliographyFilter'),
      }),
    )
    if (result?.snapshot) this.apply(result.snapshot)
  }

  /** Changes the spelling and grammar settings of the project. */
  async setProofing(patch: {
    language?: string | null
    level?: 'default' | 'picky'
    disabledRules?: string[]
    disabledCategories?: string[]
  }): Promise<void> {
    const result = await call(window.api.project.setProofing(patch))
    if (result) this.apply(result.snapshot)
  }

  async setQuoteBlockMarks(blockMarks: boolean): Promise<void> {
    const result = await call(window.api.project.setQuoteBlockMarks({ blockMarks }))
    if (result) this.apply(result.snapshot)
  }

  async setQuoteStyle(style: QuoteStyle): Promise<void> {
    const result = await call(window.api.project.setQuoteStyle({ style }))
    if (result) this.apply(result.snapshot)
  }

  async removeMissing(path: string): Promise<void> {
    const result = await call(window.api.project.removeMissing({ path }))
    if (result) this.apply(result.snapshot)
  }

  async relink(missingPath: string, targetPath: string): Promise<void> {
    const result = await call(window.api.project.relink({ missingPath, targetPath }))
    if (result) this.apply(result.snapshot)
  }

  /** Unlisted items (on disk, not yet in the manifest) next to a missing entry, as relink targets. */
  relinkCandidates(missingPath: string): TreeNodeDto[] {
    if (!this.snapshot) return []
    const isSheet = missingPath.toLowerCase().endsWith('.typ')
    const parent = asGroup(this.node(dirname(missingPath)))
    const unlisted = new Set(
      this.snapshot.warnings.flatMap((w) => (w.kind === 'unlisted' ? [w.path] : [])),
    )
    return (parent?.children ?? []).filter(
      (c) => c.kind === (isSheet ? 'sheet' : 'group') && unlisted.has(c.path),
    )
  }

  /** The sheets in the export that come before this one in project order: their footnotes, figures
   * and tables are counted first, so the numbers run on across the project. */
  private exportedBefore(path: string): SheetNodeDto[] {
    const before: SheetNodeDto[] = []
    if (this.snapshot) {
      for (const { node } of flattenSheets(this.snapshot.tree)) {
        if (node.kind !== 'sheet') continue
        if (node.path === path) break
        if (node.inExport) before.push(node)
      }
    }
    return before
  }

  /** Where footnote numbering stands at the start of a sheet. */
  footnoteOffsets(path: string): FootnoteOffsets {
    return offsetsAfter(
      this.exportedBefore(path).map((node): FootnoteSummary => ({
        count: node.footnotes,
        afterLastChapter: node.footnotesAfterChapter,
      })),
    )
  }

  /** The numbered figures in the sheets before this one. */
  figureOffset(path: string): number {
    return this.exportedBefore(path).reduce((sum, node) => sum + node.figures, 0)
  }

  /** The numbered tables in the sheets before this one. */
  tableOffset(path: string): number {
    return this.exportedBefore(path).reduce((sum, node) => sum + node.tables, 0)
  }

  /** All sheets in tree order, for quick open. */
  allSheets(): { path: string; name: string; text: string; folder: string }[] {
    const out: { path: string; name: string; text: string; folder: string }[] = []
    const walk = (group: GroupNodeDto): void => {
      for (const child of group.children) {
        if (child.kind === 'group') walk(child)
        else if (child.kind === 'sheet')
          out.push({
            path: child.path,
            name: this.sheetLabel(child.path),
            text: child.preview.map(([, text]) => text).join(' '),
            folder: dirname(child.path),
          })
      }
    }
    if (this.snapshot) walk(this.snapshot.tree)
    return out
  }
}

export const project = new ProjectStore()
