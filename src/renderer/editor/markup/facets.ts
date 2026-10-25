import { Facet } from '@codemirror/state'

/** Show raw source everywhere instead of hiding syntax and drawing pills. */
export const showSourceFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.at(-1) ?? false,
})

export interface MarkupLabels {
  /** Accessible label of a comment pill. */
  comment: (text: string) => string
}

export const labelsFacet = Facet.define<MarkupLabels, MarkupLabels>({
  combine: (values) => values.at(-1) ?? { comment: (text) => text },
})
