import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSection,
} from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { insideOpaque } from '@core/typst/edit'
import type { IconName } from '../../editor/icons'
import { i18n } from '../../i18n/i18n.svelte'
import { shortcutLabel } from '../../lib/shortcut'
import { editorCommands, runEditorCommand } from './editorCommands'
import type { EditorCommandId } from './editorCommands'

/**
 * The slash menu: `/` at the start of a line offers what a paragraph can be (text, a heading, a list,
 * a block quote, an epigraph) and everything that can be inserted (a footnote, a citation, a
 * cross-reference, a quote, images, a table, formulas, a divider, a link, a comment). Typing after
 * the slash narrows it, by name or by another word for the thing in either language ("h2", "bild",
 * "image"). Choosing one takes the slash and what was typed after it away and runs the command, as
 * the toolbar would. A slash elsewhere (a fraction, "und/oder") is text.
 */

export interface SlashItem {
  command: EditorCommandId
  section: 'paragraph' | 'insert'
  icon: IconName
  label: () => string
  /** Other words that find it, in both languages, lower case. */
  words: string
}

const heading = (level: 1 | 2 | 3 | 4): SlashItem => ({
  command: `style-heading-${level}`,
  section: 'paragraph',
  icon: `h-${level}`,
  label: () => i18n.t('paragraph.heading', { level }),
  words: `h${level} heading überschrift titel title ${level === 1 ? 'kapitel chapter' : 'abschnitt section'}`,
})

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    command: 'style-text',
    section: 'paragraph',
    icon: 'pilcrow',
    label: () => i18n.t('paragraph.text'),
    words: 'text absatz paragraph body plain',
  },
  heading(1),
  heading(2),
  heading(3),
  heading(4),
  {
    command: 'style-bullet',
    section: 'paragraph',
    icon: 'list',
    label: () => i18n.t('list.bullet'),
    words: 'liste list bullet punkte ul',
  },
  {
    command: 'style-numbered',
    section: 'paragraph',
    icon: 'list-numbers',
    label: () => i18n.t('list.numbered'),
    words: 'liste list numbered nummerierung nummern ol enum',
  },
  {
    command: 'style-quote',
    section: 'paragraph',
    icon: 'blockquote',
    label: () => i18n.t('quote.block'),
    words: 'zitat quote blockquote block',
  },
  {
    command: 'style-epigraph',
    section: 'paragraph',
    icon: 'blockquote',
    label: () => i18n.t('quote.epigraph'),
    words: 'epigraph motto zitat quote',
  },
  {
    command: 'footnote',
    section: 'insert',
    icon: 'asterisk',
    label: () => i18n.t('toolbar.footnote'),
    words: 'fußnote fussnote footnote note anmerkung',
  },
  {
    command: 'citation',
    section: 'insert',
    icon: 'book',
    label: () => i18n.t('toolbar.citation'),
    words: 'beleg citation cite quelle source literatur reference',
  },
  {
    command: 'cross-reference',
    section: 'insert',
    icon: 'tag',
    label: () => i18n.t('toolbar.crossRef'),
    words: 'querverweis verweis cross reference ref',
  },
  {
    command: 'quote-inline',
    section: 'insert',
    icon: 'quote',
    label: () => i18n.t('quote.inline'),
    words: 'zitat quote inline anführungszeichen',
  },
  {
    command: 'figure',
    section: 'insert',
    icon: 'text-caption',
    label: () => i18n.t('image.insertFigure'),
    words: 'bild abbildung figure image foto photo grafik',
  },
  {
    command: 'inline-image',
    section: 'insert',
    icon: 'photo',
    label: () => i18n.t('image.insertInline'),
    words: 'bild image inline foto photo symbol',
  },
  {
    command: 'table',
    section: 'insert',
    icon: 'table',
    label: () => i18n.t('toolbar.table'),
    words: 'tabelle table',
  },
  {
    command: 'formula',
    section: 'insert',
    icon: 'math-function',
    label: () => i18n.t('formula.insertInline'),
    words: 'formel formula math mathe gleichung equation inline',
  },
  {
    command: 'formula-display',
    section: 'insert',
    icon: 'math',
    label: () => i18n.t('formula.insertDisplay'),
    words: 'formel formula math mathe gleichung equation display block',
  },
  {
    command: 'divider',
    section: 'insert',
    icon: 'separator',
    label: () => i18n.t('slash.divider'),
    words: 'trenner trennlinie divider separator linie rule sternchen asterisks break hr',
  },
  {
    command: 'link',
    section: 'insert',
    icon: 'link',
    label: () => i18n.t('toolbar.link'),
    words: 'link hyperlink url web adresse address',
  },
  {
    command: 'comment',
    section: 'insert',
    icon: 'message',
    label: () => i18n.t('toolbar.comment'),
    words: 'kommentar comment notiz note',
  },
]

/** How well an item answers the query: 0 its name starts with it, 1 another word does, 2 it is inside a word; null no match. */
export function slashRank(
  item: SlashItem,
  query: string,
  label: string = item.label(),
): number | null {
  const needle = query.normalize('NFC').toLowerCase()
  if (needle === '') return 0
  const name = label.normalize('NFC').toLowerCase()
  if (name.startsWith(needle)) return 0
  const words = `${name} ${item.words}`.split(/[\s-]+/)
  if (words.some((word) => word.startsWith(needle))) return 1
  if (name.includes(needle)) return 2
  return null
}

const SECTIONS: Record<SlashItem['section'], () => CompletionSection> = {
  paragraph: () => ({ name: i18n.t('slash.section.paragraph'), rank: 0 }),
  insert: () => ({ name: i18n.t('slash.section.insert'), rank: 1 }),
}

/** An option of the menu, with the icon drawn before it (`completion.ts`). */
export interface SlashCompletion extends Completion {
  icon: IconName
}

function completionOf(item: SlashItem, label: string): SlashCompletion {
  const shortcut = editorCommands.find((c) => c.id === item.command)?.shortcut
  return {
    label,
    ...(shortcut ? { detail: shortcutLabel(shortcut) } : {}),
    icon: item.icon,
    section: SECTIONS[item.section](),
    apply: (view, _completion, from, to) => {
      // The slash and what was typed after it go; the command then acts where they were.
      view.dispatch({
        changes: { from, to },
        selection: { anchor: from },
        userEvent: 'input.complete',
      })
      runEditorCommand(view, item.command)
    },
  }
}

export function slashSource(context: CompletionContext): CompletionResult | null {
  if (context.state.readOnly) return null
  const match = context.matchBefore(/\/[\p{L}\p{N}-]*/u)
  if (!match) return null
  // Only at the start of a line (after its indent), and not in code, math, raw text or a comment.
  const line = context.state.doc.lineAt(match.from)
  if (context.state.sliceDoc(line.from, match.from).trim() !== '') return null
  if (insideOpaque(syntaxTree(context.state), match.from)) return null
  const query = match.text.slice(1)
  const options = SLASH_ITEMS.flatMap((item, index) => {
    const label = item.label()
    const rank = slashRank(item, query, label)
    return rank === null ? [] : [{ item, label, rank, index }]
  })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item, label }) => completionOf(item, label))
  if (options.length === 0) return null
  // Every key typed searches again: the words are not a prefix match CodeMirror could narrow itself.
  return {
    from: match.from,
    options,
    filter: false,
    update: (_result, _from, _to, next) => slashSource(next),
  }
}
