import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** The writing surface, from design tokens only. Shared by the editor and the continuous view. */
export const writingTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-window)', color: 'var(--color-label)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-writing)',
    fontSize: 'var(--text-writing)',
    lineHeight: 'var(--line-writing)',
    overflow: 'auto',
  },
  '.cm-content': {
    maxWidth: 'var(--measure-writing)',
    boxSizing: 'border-box',
    margin: '0 auto',
    padding: 'var(--sp-32) var(--sp-24) 30vh',
    caretColor: 'var(--color-label)',
  },
  '.cm-line': { padding: '0' },
  // The writer's space at every line break: a blank line is that tall, and a line that follows
  // another directly is set off by it. The markup decides which lines these are, from the text
  // (`lineSpacing` in `markup/layout.ts`): a style that looks at the neighbouring lines in the DOM makes
  // CodeMirror's heights jump while scrolling.
  '.cm-line.cm-blank': { lineHeight: 'var(--paragraph-gap-writing)' },
  // The empty line between two paragraphs is the gap between them.
  '.cm-line.cm-gap': { lineHeight: 'var(--paragraph-gap-writing)' },
  '.cm-line.cm-spaced': { paddingTop: 'var(--paragraph-gap-writing)' },
  // A heading keeps its own space above and adds the gap when it directly follows a line.
  '.cm-line.cm-spaced.cm-heading': { paddingTop: 'calc(0.5em + var(--paragraph-gap-writing))' },
  // The rule beside a quote runs through its padding, so the gap before a quote belongs to the line
  // above it: the rule starts at the quote's first line and does not reach up into the line break.
  // (Not a margin, which CodeMirror would leave out of the line's height.)
  '.cm-line.cm-before-quote': { paddingBottom: 'var(--paragraph-gap-writing)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-label)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    {
      backgroundColor: 'var(--color-selection)',
    },
  // The menus that `@` and `/` open (CodeMirror's completion list): the foundation's popover with the kit's
  // rows (kit/dom.css), the row the keys are on on the selection's ground.
  '.cm-tooltip.cm-tooltip-autocomplete': {
    overflow: 'hidden',
    border: '0',
    borderRadius: 'var(--r-lg)',
    background: 'var(--color-window)',
    boxShadow: 'var(--shadow-float)',
    color: 'var(--color-label)',
    font: 'var(--type-body)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    maxHeight: '16em',
    padding: 'var(--sp-4)',
    font: 'var(--type-body)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-8)',
    minHeight: 'var(--row-single)',
    padding: '0 var(--sp-8)',
    borderRadius: 'var(--r-md)',
    color: 'var(--color-label)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--color-selection)',
    color: 'var(--color-label)',
  },
  // The headings of the slash menu's groups ("Absatz", "Einfügen").
  '.cm-tooltip.cm-tooltip-autocomplete > ul > completion-section': {
    display: 'block',
    padding: 'var(--sp-8) var(--sp-8) var(--sp-4)',
    border: '0',
    opacity: '1',
    color: 'var(--color-label-tertiary)',
    font: 'var(--type-caption)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > completion-section:first-child': {
    paddingTop: 'var(--sp-4)',
  },
  '.cm-completionKind': { flex: 'none', color: 'var(--color-label-tertiary)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionKind': {
    color: 'var(--color-accent)',
  },
  '.cm-completionLabel': { font: 'var(--type-emphasis)' },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    color: 'var(--color-label-tertiary)',
    font: 'var(--type-caption)',
    fontStyle: 'normal',
  },
  // The slash menu: wider and taller than the `@` menu, its names in the text's weight with the
  // letters typed marked in the accent, each icon on a small tile (on the window's ground, the icon in
  // the accent, on the row the keys are on), and a hairline between its two groups.
  '.cm-tooltip.cm-tooltip-autocomplete.cm-slash-menu > ul': {
    minWidth: 'calc(var(--sp-32) * 9)',
    maxHeight: 'calc(var(--row-single) * 12)',
    scrollbarWidth: 'thin',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-slash-menu > ul > li': {
    paddingLeft: 'var(--sp-4)',
  },
  '.cm-slash-menu .cm-completionLabel': { font: 'var(--type-body)' },
  '.cm-slash-menu .cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--color-accent)',
  },
  '.cm-slash-icon': {
    display: 'flex',
    flex: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--control-sm)',
    height: 'var(--control-sm)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--color-control)',
    color: 'var(--color-label-secondary)',
  },
  '.cm-slash-icon .cm-completionKind': { color: 'inherit' },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-slash-menu > ul > li[aria-selected] .cm-slash-icon': {
    background: 'var(--color-window)',
    color: 'var(--color-accent)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-slash-menu > ul > completion-section:not(:first-child)': {
    marginTop: 'var(--sp-4)',
    borderTop: '1px solid var(--color-separator)',
  },
  '.cm-tooltip.cm-completionInfo': {
    maxWidth: '24em',
    padding: 'var(--sp-8) var(--sp-12)',
    border: '0',
    borderRadius: 'var(--r-md)',
    background: 'var(--color-window)',
    boxShadow: 'var(--shadow-float)',
    color: 'var(--color-label-secondary)',
    font: 'var(--type-caption)',
  },
})

/** The main process hands the page a fresh nonce; CodeMirror needs it for the styles it injects. */
export function cspNonceExtension(): Extension[] {
  const value = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content
  return value && !value.startsWith('__') ? [EditorView.cspNonce.of(value)] : []
}

/** Spell-check is LanguageTool's job; the browser's is off. */
export const noBrowserProofing = (lang: string, label: string): Extension =>
  EditorView.contentAttributes.of({
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
    lang,
    'aria-label': label,
  })
