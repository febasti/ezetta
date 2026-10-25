import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, Text } from '@codemirror/state'
import type { Tree } from '@lezer/common'

/**
 * The whole document as one string, for the code that scans all of it (the fields of citations,
 * footnotes, quotes, …). A keystroke updates every one of those fields, so the copy is made once
 * per version of the document and shared by them. A version's text never changes, so it is cached
 * by its `Text`, and dropped with it.
 */
const texts = new WeakMap<Text, string>()

export function sourceText(state: EditorState): string {
  let text = texts.get(state.doc)
  if (text === undefined) {
    text = state.doc.toString()
    texts.set(state.doc, text)
  }
  return text
}

/** The syntax tree of the whole document, parsing what is still missing (for up to 200 ms). */
export function fullTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
}
