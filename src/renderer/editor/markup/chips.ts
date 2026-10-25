import { citationGroups } from '@core/typst/citations'
import type { Citation, MissingCitation } from '@core/typst/citations'
import type { CrossRef } from '@core/typst/targets'
import { referenceText } from '@core/typst/targets'
import type { SyntaxNode } from '@lezer/common'
import { activeCiteField, citeConfig, citeField, missingField } from '../citeState'
import type { CiteConfig } from '../citeState'
import { CiteWidget, NeededWidget, groupChipFor } from '../citeWidget'
import { activeRefField, chipText, refConfig, refField, resolve } from '../refState'
import type { ActiveRef, RefConfig, RefIndex } from '../refState'
import { RefWidget } from '../refWidget'
import { mark } from './builder'
import type { Builder, Call } from './builder'

/**
 * Citations and cross-references, drawn as chips. Citations that print together are one chip, and
 * a place that still needs a citation (the comment `#cite-needed`) is a chip that says so. Like footnote
 * markers and images, chips never reveal their source by touch: the caret jumps over them, and
 * Backspace or Delete next to one first selects it, a second press deletes it (`atomicKeys.ts`).
 */
export class ChipMarkup {
  readonly settings: CiteConfig
  /** Where the citation chip whose editor is open starts. */
  readonly activeFrom: number | null
  /** The citations that print together, in the order of the text. */
  readonly groups: Citation[][]
  /** The group each citation belongs to, by where the citation starts. */
  private readonly groupByMember = new Map<number, Citation[]>()
  private readonly missingByStart: Map<number, MissingCitation>
  /** Comments that are a citation's check mark: they are part of the chip. */
  private readonly checkMarks: Set<number>
  private readonly refSettings: RefConfig
  private readonly activeRef: ActiveRef | null
  private readonly refIndex: RefIndex | undefined
  private readonly refsByStart: Map<number, CrossRef>

  constructor(private readonly b: Builder) {
    const { state, caret } = b
    this.settings = state.facet(citeConfig)
    const active = state.field(activeCiteField, false)
    this.activeFrom = active?.kind === 'group' ? active.from : null
    const all = state.field(citeField, false) ?? []
    // A key that is not in the library, with the caret at its end, is still being typed: it stays
    // text (and the `@` menu has something to complete).
    const citations = all.filter(
      (c) =>
        !(c.kind === 'short' && caret.empty && caret.head === c.to && !this.settings.lookup(c.key)),
    )
    this.groups = citationGroups(citations, (from, to) => state.sliceDoc(from, to))
    for (const group of this.groups) for (const c of group) this.groupByMember.set(c.from, group)
    this.missingByStart = new Map(
      (state.field(missingField, false) ?? []).map((marker) => [marker.from, marker]),
    )
    this.checkMarks = new Set(all.flatMap((c) => (c.check ? [c.check.from] : [])))
    this.refSettings = state.facet(refConfig)
    this.activeRef = state.field(activeRefField, false) ?? null
    this.refIndex = state.field(refField, false)
    this.refsByStart = new Map((this.refIndex?.refs ?? []).map((ref) => [ref.from, ref]))
  }

  /**
   * A block comment that belongs to the citations: a check mark (drawn in its chip) or a marker of a
   * missing citation (drawn as a chip). True if it is one, and so is not drawn as a comment.
   */
  comment(node: SyntaxNode): boolean {
    const { b } = this
    if (node.name !== 'BlockComment' || b.showSource) return false
    if (this.checkMarks.has(node.from)) return true
    const needed = this.missingByStart.get(node.from)
    if (!needed) return false
    b.addWidget(
      new NeededWidget(
        needed,
        this.settings,
        this.activeFrom === needed.from,
        b.selected(needed.from, needed.to),
      ),
      needed.from,
      needed.to,
      { from: needed.from, to: needed.to, block: false },
    )
    return true
  }

  /** `@key`: a citation is a chip; a cross-reference is a chip too, or stays text while being typed. */
  ref(node: SyntaxNode): void {
    const group = this.groupByMember.get(node.from)
    if (group && !this.b.showSource) {
      if (group[0]!.from === node.from) this.addGroup(group) // the others are part of this chip
      return
    }
    if (this.addRef(node.from)) return
    this.b.add(mark('cm-ref'), node.from, node.to)
  }

  /** `#ref(<label>)`: the long form of a cross-reference. */
  longRef({ node }: Call): boolean {
    return !!this.refsByStart.get(node.from)?.long && this.addRef(node.from)
  }

  /** `#cite(<key>, …)`: the long form of a citation. */
  longCite({ node }: Call): boolean {
    const group = this.groupByMember.get(node.from)
    if (!group || this.b.showSource) return false
    if (group.find((c) => c.from === node.from)?.kind !== 'long') return false
    if (group[0]!.from === node.from) this.addGroup(group)
    return true
  }

  /** Draws a group of citations as one chip, from the first one (the others are inside it). */
  private addGroup(group: Citation[]): void {
    const { b } = this
    const from = group[0]!.from
    const to = group[group.length - 1]!.end
    b.addWidget(
      new CiteWidget(groupChipFor(group, this.settings), this.settings, {
        active: this.activeFrom === from,
        selected: b.selected(from, to),
      }),
      from,
      to,
      { from, to, block: false },
    )
  }

  /** A reference is a chip; one with the caret at its end that nothing answers to is still being typed. */
  private addRef(from: number): boolean {
    const { b, refIndex, refSettings } = this
    const ref = this.refsByStart.get(from)
    if (!ref || !refIndex || b.showSource) return false
    const resolved = resolve(refIndex, ref.label)
    if (resolved.state === 'missing' && b.caret.empty && b.caret.head === ref.to && !ref.long)
      return false
    b.addWidget(
      new RefWidget(
        chipText(ref, resolved, refSettings),
        resolved.state,
        ref.label,
        refSettings,
        {
          active: this.activeRef?.kind === 'ref' && this.activeRef.from === ref.from,
          selected: b.selected(ref.from, ref.to),
        },
        resolved.state === 'missing'
          ? null
          : {
              kind: resolved.target.kind,
              text: referenceText(resolved.target, refSettings.supplements),
              title: resolved.target.title,
              sheet:
                resolved.target.path === refSettings.livePath
                  ? null
                  : refSettings.sheetName(resolved.target.path),
            },
      ),
      ref.from,
      ref.to,
      { from: ref.from, to: ref.to, block: false },
    )
    return true
  }
}
