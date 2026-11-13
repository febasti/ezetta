import { autocompletion } from '@codemirror/autocomplete'
import type { CompletionSource } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { icon } from '../../editor/icons'
import type { IconName } from '../../editor/icons'
import { CITE_ICONS, citeSource } from './citeComplete'
import { slashSource } from './slashMenu'

/**
 * The menus that open at the caret while typing, in CodeMirror's one completion list: `@` offers
 * works and cross-references (`citeComplete.ts`), `/` at the start of a line what a paragraph can be
 * and what can be inserted (`slashMenu.ts`).
 */
const completion = (sources: CompletionSource[]): Extension =>
  autocompletion({
    override: sources,
    icons: false,
    addToOptions: [
      {
        render: (option) => {
          const own = (option as { icon?: IconName }).icon
          const name = own ?? (option.type ? CITE_ICONS[option.type] : undefined)
          return name ? icon(name, 16, 'cm-completionKind') : null
        },
        // Before the label (CodeMirror's own icons sit at 20, the label at 50).
        position: 20,
      },
    ],
    defaultKeymap: true,
  })

/** The sheet's editor: the `@` menu and the slash menu. */
export const editorCompletion: Extension = completion([citeSource, slashSource])

/** A note's text: the `@` menu only (a note has no paragraphs of its own kinds). */
export const noteCompletion: Extension = completion([citeSource])
