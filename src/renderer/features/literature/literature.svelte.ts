import { summarizeLiterature } from '@core/bib/literature'
import type { SheetCitations } from '@core/bib/literature'
import { flattenSheets } from '@core/project/tree'
import type { SheetNodeDto } from '@shared/project'
import { ui } from '../../lib/ui.svelte'
import { bibliography } from '../bibliography/bibliography.svelte'
import { editor } from '../editor/editorSession.svelte'
import { project } from '../sidebar/project.svelte'

const fromNode = (node: SheetNodeDto): SheetCitations => ({
  path: node.path,
  citations: node.citations,
  missing: node.missingCitations,
  checks: node.citationChecks,
})

/**
 * The works cited in the scope the writer chose: the open sheet, the selected group with
 * its subgroups, or the whole project. The sheets report what they cite when they are saved; the
 * open sheet is read from the editor, so the list follows what is being typed.
 */
class LiteratureStore {
  /** The sheets in the scope, in the order of the project. */
  sheets = $derived.by((): SheetCitations[] => {
    const snapshot = project.snapshot
    if (!snapshot) return []
    const live = editor.liveCitations
    const openPath = editor.path
    const withLive = (node: SheetNodeDto): SheetCitations =>
      live && node.path === openPath
        ? { path: node.path, citations: live.works, missing: live.missing, checks: live.checks }
        : fromNode(node)

    if (ui.literatureScope === 'sheet' && openPath) {
      const node = project.node(openPath)
      if (node?.kind === 'sheet') return [withLive(node)]
    }
    const root = snapshot.tree
    const selected = project.node(project.selectedGroup)
    const scopeRoot =
      ui.literatureScope !== 'project' && selected?.kind === 'group' ? selected : root
    // What is left out of the export is not cited in the thesis, unless that is what is being looked at.
    return flattenSheets(scopeRoot).flatMap(({ node }) =>
      node.kind === 'sheet' && (node.inExport || !scopeRoot.inExport) ? [withLive(node)] : [],
    )
  })

  summary = $derived.by(() => {
    void bibliography.version // the bibliography was read again
    return summarizeLiterature(this.sheets, bibliography.lookup)
  })

  /** The keys the open sheet cites, for the dot in the list. */
  citedHere = $derived(new Set((editor.liveCitations?.works ?? []).map(([key]) => key)))
}

export const literature = new LiteratureStore()
