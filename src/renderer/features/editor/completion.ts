import { autocompletion, currentCompletions } from '@codemirror/autocomplete'
import type { CompletionSource } from '@codemirror/autocomplete'
import { Prec } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { icon } from '../../editor/icons'
import { CITE_ICONS, citeSource } from './citeComplete'
import { dismissSlash, isSlash, slashSource } from './slashMenu'

/**
 * The menus that open at the caret while typing, in CodeMirror's one completion list: `@` offers
 * works and cross-references (`citeComplete.ts`), `/` at the start of a line what a paragraph can be
 * and what can be inserted (`slashMenu.ts`).
 */
const completion = (sources: CompletionSource[]): Extension =>
  autocompletion({
    override: sources,
    icons: false,
    // The slash menu has a look of its own (`editor/theme.ts`): wider, taller, its icons on tiles.
    tooltipClass: (state) => (isSlash(currentCompletions(state)[0]) ? 'cm-slash-menu' : ''),
    addToOptions: [
      {
        render: (option) => {
          if (isSlash(option)) {
            const tile = document.createElement('span')
            tile.className = 'cm-slash-icon'
            tile.append(icon(option.icon, 16, 'cm-completionKind'))
            return tile
          }
          const name = option.type ? CITE_ICONS[option.type] : undefined
          return name ? icon(name, 16, 'cm-completionKind') : null
        },
        // Before the label (CodeMirror's own icons sit at 20, the label at 50).
        position: 20,
      },
    ],
    defaultKeymap: true,
  })

/** The sheet's editor: the `@` menu and the slash menu. Escape in the slash menu goes before the list's own. */
export const editorCompletion: Extension = [
  Prec.highest(keymap.of([{ key: 'Escape', run: dismissSlash }])),
  completion([citeSource, slashSource]),
]

/** A note's text: the `@` menu only (a note has no paragraphs of its own kinds). */
export const noteCompletion: Extension = completion([citeSource])
