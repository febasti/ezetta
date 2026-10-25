import { redo, undo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'
import {
  continueList,
  indentListItems,
  insertComment,
  insertFootnote,
  linkAt,
  normalizeUrl,
  removeLink,
  setLink,
  setParagraphStyle,
  toggleInline,
} from '@core/typst/edit'
import type { EditInput, EditResult, InlineKind, ParagraphStyle } from '@core/typst/edit'
import { footnoteAt } from '@core/typst/footnotes'
import {
  inlineQuoteAt,
  leaveBlockQuote,
  quoteToBlock,
  quoteToInline,
  toggleInlineQuote,
} from '@core/typst/quotes'
import { footnoteField, openNote } from '../../editor/footnoteState'
import type { NoteView } from '../../editor/footnoteState'
import { citeField } from '../../editor/citeState'
import { quoteField } from '../../editor/quoteState'
import { chooseCitation } from './citations'
import { chooseCrossReference } from './crossRefCommand'
import { insertTableCommand } from './tables'
import { insertFormulaCommand } from './formulas'
import { chooseAndInsert, insertPlaceholder } from './images'
import { i18n } from '../../i18n/i18n.svelte'
import type { MessageKey } from '../../i18n/translate'
import type { MenuItem } from '../../lib/menu.svelte'
import { promptDialog } from '../../lib/ui.svelte'
import type { Shortcut } from '../../lib/shortcut'
import { keybindings } from '../../lib/keybindings.svelte'
import { toCodeMirrorKey } from '../../lib/shortcut'

/** Commands that change the text of the open sheet. Each applies a pure function from
 * `src/core/typst/edit.ts` as one transaction, so undo and redo work. */
export type EditorCommandId =
  | 'undo'
  | 'redo'
  | 'emphasis'
  | 'strong'
  | 'highlight'
  | 'subscript'
  | 'superscript'
  | 'smallcaps'
  | 'comment'
  | 'link'
  | 'footnote'
  | 'figure'
  | 'inline-image'
  | 'citation'
  | 'cross-reference'
  | 'table'
  | 'formula'
  | 'formula-display'
  | 'style-text'
  | 'style-heading-1'
  | 'style-heading-2'
  | 'style-heading-3'
  | 'style-heading-4'
  | 'style-bullet'
  | 'style-numbered'
  | 'style-quote'
  | 'style-epigraph'
  | 'quote-inline'

export interface EditorCommand {
  id: EditorCommandId
  label: () => string
  /** The shortcut it has now: the writer's choice, else the default. */
  shortcut?: Shortcut | undefined
  /** The shortcut it comes with. */
  defaultShortcut?: Shortcut | undefined
  run: (view: EditorView) => void | Promise<void>
}

function inputOf(view: EditorView): EditInput {
  const { from, to } = view.state.selection.main
  return { doc: view.state.doc.toString(), tree: syntaxTree(view.state), from, to }
}

function apply(view: EditorView, result: EditResult): void {
  const { anchor, head } = view.state.selection.main
  if (result.changes.length === 0 && result.anchor === anchor && result.head === head) return
  view.dispatch({
    changes: result.changes,
    selection: EditorSelection.single(result.anchor, result.head),
    scrollIntoView: true,
    userEvent: 'input.format',
  })
}

const inline = (
  id: EditorCommandId,
  label: MessageKey,
  kind: InlineKind,
  shortcut?: Shortcut,
): EditorCommand => ({
  id,
  label: () => i18n.t(label),
  ...(shortcut ? { shortcut } : {}),
  run: (view) => apply(view, toggleInline(inputOf(view), kind)),
})

const paragraph = (
  id: EditorCommandId,
  style: ParagraphStyle,
  label: () => string,
  shortcut?: Shortcut,
): EditorCommand => ({
  id,
  label,
  ...(shortcut ? { shortcut } : {}),
  run: (view) => apply(view, setParagraphStyle(inputOf(view), style)),
})

const heading = (level: number): EditorCommand =>
  paragraph(
    `style-heading-${level}` as EditorCommandId,
    { kind: 'heading', level },
    () => i18n.t('cmd.styleHeading', { level }),
    level <= 3 ? { key: String(level), alt: true } : undefined,
  )

/** Applies an inserted note and returns it. */
function created(view: EditorView, result: EditResult): NoteView | undefined {
  apply(view, result)
  return view.state.field(footnoteField).find((note) => note.contentFrom === result.anchor)
}

const DEFAULT_EDITOR_COMMANDS: readonly EditorCommand[] = [
  // Undo and redo are bound by CodeMirror's own history keymap, so they have no shortcut here.
  { id: 'undo', label: () => i18n.t('cmd.undo'), run: (view) => void undo(view) },
  { id: 'redo', label: () => i18n.t('cmd.redo'), run: (view) => void redo(view) },
  inline('emphasis', 'cmd.emphasis', 'emphasis', { key: 'i' }),
  inline('strong', 'cmd.strong', 'strong', { key: 'b' }),
  inline('highlight', 'cmd.highlight', 'highlight', { key: 'h', shift: true }),
  // No shortcut: Cmd+, is the settings (macOS), and no other key is chosen yet.
  inline('subscript', 'cmd.subscript', 'subscript'),
  inline('superscript', 'cmd.superscript', 'superscript', { key: '.' }),
  inline('smallcaps', 'cmd.smallcaps', 'smallcaps'),
  {
    id: 'comment',
    label: () => i18n.t('cmd.comment'),
    shortcut: { key: 'm', shift: true },
    run: (view) => apply(view, insertComment(inputOf(view))),
  },
  {
    id: 'link',
    label: () => i18n.t('cmd.link'),
    shortcut: { key: 'k', shift: true },
    run: async (view) => {
      const existing = linkAt(inputOf(view))
      const answer = await promptDialog({
        title: i18n.t('prompt.linkTitle'),
        label: i18n.t('prompt.linkLabel'),
        initial: existing?.url ?? 'https://',
        // On a link, it can also be taken off: the words stay.
        ...(existing
          ? {
              action: {
                label: i18n.t('prompt.linkRemove'),
                run: () => {
                  view.focus()
                  apply(view, removeLink(inputOf(view)))
                },
              },
            }
          : {}),
      })
      view.focus()
      const url = answer === null ? null : normalizeUrl(answer)
      if (url) apply(view, setLink(inputOf(view), url))
    },
  },
  {
    id: 'footnote',
    label: () => i18n.t('cmd.footnote'),
    shortcut: { key: 'f', alt: true },
    run: (view) => {
      // On an existing note this opens its editor; elsewhere it inserts an empty note and opens that.
      const { from, to } = view.state.selection.main
      const existing = footnoteAt(view.state.field(footnoteField), from, to)
      const note = existing ?? created(view, insertFootnote(inputOf(view)))
      if (!note) return
      // The note edits in its own popover, so the main caret steps out and the marker shows.
      view.dispatch({ selection: { anchor: note.to } })
      openNote(view, note.from)
    },
  },
  {
    id: 'figure',
    label: () => i18n.t('cmd.figure'),
    shortcut: { key: 'b', alt: true },
    run: (view) => insertPlaceholder(view),
  },
  {
    id: 'table',
    label: () => i18n.t('cmd.table'),
    run: (view) => insertTableCommand(view),
  },
  {
    id: 'citation',
    label: () => i18n.t('cmd.citation'),
    shortcut: { key: 'c', alt: true },
    run: (view) => chooseCitation(view),
  },
  {
    id: 'cross-reference',
    label: () => i18n.t('cmd.crossReference'),
    shortcut: { key: 'r', alt: true },
    run: (view) => chooseCrossReference(view),
  },
  {
    id: 'formula',
    label: () => i18n.t('cmd.formula'),
    shortcut: { key: 'm', alt: true },
    run: (view) => insertFormulaCommand(view, false),
  },
  {
    id: 'formula-display',
    label: () => i18n.t('cmd.formulaDisplay'),
    run: (view) => insertFormulaCommand(view, true),
  },
  {
    id: 'inline-image',
    label: () => i18n.t('cmd.inlineImage'),
    run: (view) => chooseAndInsert(view, 'inline'),
  },
  paragraph('style-text', { kind: 'text' }, () => i18n.t('cmd.styleText'), { key: '0', alt: true }),
  heading(1),
  heading(2),
  heading(3),
  heading(4),
  paragraph('style-bullet', { kind: 'bullet' }, () => i18n.t('cmd.styleBullet'), {
    key: '8',
    shift: true,
  }),
  paragraph('style-numbered', { kind: 'numbered' }, () => i18n.t('cmd.styleNumbered'), {
    key: '7',
    shift: true,
  }),
  quoteAsBlock(),
  paragraph('style-epigraph', { kind: 'epigraph' }, () => i18n.t('cmd.styleEpigraph')),
  quoteAsInline(),
]

/**
 * The commands as the menus, the toolbar and the keymap read them: `shortcut` is looked up each
 * time, so a shortcut the writer sets in the settings applies at once. The id of a command in the
 * writer's choices is `editor-` and its own.
 */
export const editorCommands: readonly EditorCommand[] = DEFAULT_EDITOR_COMMANDS.map((command) => ({
  ...command,
  defaultShortcut: command.shortcut,
  get shortcut(): Shortcut | undefined {
    return keybindings.of(`editor-${command.id}`, command.shortcut)
  },
}))

/**
 * Block quote (the paragraph style). In an inline quote it makes that quote a block of its own
 * instead; elsewhere it toggles the paragraph style like the other styles.
 */
function quoteAsBlock(): EditorCommand {
  const style = paragraph('style-quote', { kind: 'quote' }, () => i18n.t('cmd.styleQuote'), {
    key: 'q',
    alt: true,
  })
  return {
    ...style,
    run: (view) => {
      const { from, to } = view.state.selection.main
      const inline = inlineQuoteAt(view.state.field(quoteField), from, to)
      const result = inline
        ? quoteToBlock(view.state.doc.toString(), inline, view.state.field(citeField))
        : null
      if (!result) return style.run(view)
      view.dispatch({
        changes: result.edit,
        selection: { anchor: result.caret },
        scrollIntoView: true,
        userEvent: 'input.format',
      })
      return undefined
    },
  }
}

/**
 * Quote in the text. On a selection it wraps it, in a quote it takes the quote off, and in a block
 * quote it makes that an inline quote (when it is one paragraph).
 */
function quoteAsInline(): EditorCommand {
  return {
    id: 'quote-inline',
    label: () => i18n.t('cmd.quoteInline'),
    shortcut: { key: 'g', alt: true },
    run: (view) => {
      const { from, to } = view.state.selection.main
      const quotes = view.state.field(quoteField)
      const block = quotes.find((q) => q.block && q.from <= from && q.to >= to)
      const edits = block
        ? quoteToInline(view.state.doc.toString(), block, view.state.field(citeField))
        : null
      if (edits) return void view.dispatch({ changes: edits, userEvent: 'input.format' })
      apply(view, toggleInlineQuote(inputOf(view)))
      return undefined
    },
  }
}

export function runEditorCommand(view: EditorView, id: EditorCommandId): void {
  const command = editorCommands.find((c) => c.id === id)
  if (command) void command.run(view)
}

/** CodeMirror key bindings for every command that has a shortcut. */
export function editorKeymap(): KeyBinding[] {
  return editorCommands.flatMap((command) =>
    command.shortcut
      ? [
          {
            key: toCodeMirrorKey(command.shortcut),
            preventDefault: true,
            run: (view: EditorView) => {
              void command.run(view)
              return true
            },
          },
        ]
      : [],
  )
}

/** Enter, Tab, and Shift-Tab in lists. Each falls through to the next binding outside a list. */
export function listKeymap(): KeyBinding[] {
  const handle =
    (compute: (input: EditInput) => EditResult | null) =>
    (view: EditorView): boolean => {
      const result = compute(inputOf(view))
      if (!result) return false
      apply(view, result)
      return true
    }
  return [
    { key: 'Enter', run: handle(continueList) },
    { key: 'Tab', run: handle((input) => indentListItems(input, 1)) },
    { key: 'Shift-Tab', run: handle((input) => indentListItems(input, -1)) },
  ]
}

/** Enter on an empty last line of a block quote leaves the quote, as Enter in an empty list item ends the list. */
export function quoteKeymap(): KeyBinding[] {
  return [
    {
      key: 'Enter',
      run: (view) => {
        const { from, to } = view.state.selection.main
        const result = leaveBlockQuote(
          view.state.doc.toString(),
          view.state.field(quoteField),
          from,
          to,
        )
        if (!result) return false
        apply(view, result)
        return true
      },
    },
  ]
}

/** The command that sets a paragraph style, for menus. */
export function styleCommandId(style: ParagraphStyle): EditorCommandId {
  switch (style.kind) {
    case 'heading':
      return `style-heading-${Math.min(style.level, 4)}` as EditorCommandId
    case 'bullet':
      return 'style-bullet'
    case 'numbered':
      return 'style-numbered'
    case 'quote':
      return 'style-quote'
    case 'epigraph':
      return 'style-epigraph'
    default:
      return 'style-text'
  }
}

export function paragraphLabel(style: ParagraphStyle): string {
  switch (style.kind) {
    case 'heading':
      return i18n.t('paragraph.heading', { level: style.level })
    case 'bullet':
      return i18n.t('paragraph.bullet')
    case 'numbered':
      return i18n.t('paragraph.numbered')
    case 'quote':
      return i18n.t('paragraph.quote')
    case 'epigraph':
      return i18n.t('paragraph.epigraph')
    default:
      return i18n.t('paragraph.text')
  }
}

/** Styles offered in the paragraph menus. */
export const PARAGRAPH_STYLES: readonly ParagraphStyle[] = [
  { kind: 'text' },
  { kind: 'heading', level: 1 },
  { kind: 'heading', level: 2 },
  { kind: 'heading', level: 3 },
  { kind: 'heading', level: 4 },
  { kind: 'bullet' },
  { kind: 'numbered' },
  { kind: 'quote' },
  { kind: 'epigraph' },
]

const sameStyle = (a: ParagraphStyle, b: ParagraphStyle): boolean =>
  a.kind === b.kind && (a.kind !== 'heading' || (b.kind === 'heading' && a.level === b.level))

/** The paragraph style menu, for the selection popover and the status bar. Focus returns to the editor. */
export function paragraphMenu(view: EditorView, current: ParagraphStyle): MenuItem[] {
  return PARAGRAPH_STYLES.map((style) => ({
    label: paragraphLabel(style),
    checked: sameStyle(style, current),
    onselect: () => {
      view.focus()
      runEditorCommand(view, styleCommandId(style))
    },
  }))
}
