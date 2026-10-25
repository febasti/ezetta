import { Language, defineLanguageFacet, languageDataProp } from '@codemirror/language'
import { Parser } from '@lezer/common'
import type { Input, PartialParse, Tree } from '@lezer/common'
import { parseTypst, typstNodeSet } from '@core/typst/parser'

/**
 * Connects the core parser (`src/core/typst/parser.ts`) to CodeMirror as a language. The parser is
 * not incremental: it reads the whole text and returns the finished tree in one step, which is fast
 * enough for single sheets (one document per sheet).
 */
const languageData = defineLanguageFacet({
  commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
})

/** The core node set with the language data attached to the top node, so CodeMirror finds the language. */
const nodeSet = typstNodeSet.extend(
  languageDataProp.add((type) => (type.isTop ? languageData : undefined)),
)

class WholeDocumentParse implements PartialParse {
  parsedPos = 0
  stoppedAt: number | null = null

  constructor(private readonly input: Input) {}

  advance(): Tree {
    this.parsedPos = this.input.length
    return parseTypst(this.input.read(0, this.input.length), nodeSet)
  }

  stopAt(pos: number): void {
    this.stoppedAt = pos
  }
}

class TypstParser extends Parser {
  createParse(input: Input): PartialParse {
    return new WholeDocumentParse(input)
  }
}

export const typstLanguage = new Language(languageData, new TypstParser(), [], 'typst')
