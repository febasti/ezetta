/**
 * A word-level comparison of two texts, for showing what a restore would change. Whitespace stays
 * with the words, so the pieces joined again give back exactly the text.
 */

export type DiffPiece =
  /** In both texts. */
  | { kind: 'same'; text: string }
  /** Only in the current text: it would be lost. */
  | { kind: 'lost'; text: string }
  /** Only in the earlier version: it would come back. */
  | { kind: 'back'; text: string }

/** Beyond this many comparisons the middle of the texts is shown as one replaced block. */
const MAX_CELLS = 6_000_000

const tokens = (text: string): string[] => text.match(/^\s+|\S+\s*/g) ?? []

/** `current` against `earlier`: what a restore of `earlier` takes away and what it brings back. */
export function diffWords(current: string, earlier: string): DiffPiece[] {
  const a = tokens(current)
  const b = tokens(earlier)
  // Words are compared without the space after them, so a word at the end of a text is the same word.
  const ka = a.map((t) => t.trim())
  const kb = b.map((t) => t.trim())
  let start = 0
  while (start < a.length && start < b.length && ka[start] === kb[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const out: DiffPiece[] = []
  const push = (kind: DiffPiece['kind'], list: string[]): void => {
    if (list.length === 0) return
    const text = list.join('')
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  push('same', a.slice(0, start))

  const middleA = a.slice(start, endA)
  const middleB = b.slice(start, endB)
  const keysA = ka.slice(start, endA)
  const keysB = kb.slice(start, endB)
  if (middleA.length * middleB.length > MAX_CELLS) {
    push('lost', middleA)
    push('back', middleB)
  } else {
    // Longest common subsequence of the middle, by dynamic programming over suffixes.
    const width = middleB.length + 1
    const table = new Uint32Array((middleA.length + 1) * width)
    for (let i = middleA.length - 1; i >= 0; i -= 1) {
      for (let j = middleB.length - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          keysA[i] === keysB[j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
      }
    }
    let i = 0
    let j = 0
    while (i < middleA.length && j < middleB.length) {
      if (keysA[i] === keysB[j]) {
        push('same', [middleA[i]!])
        i += 1
        j += 1
      } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
        push('lost', [middleA[i]!])
        i += 1
      } else {
        push('back', [middleB[j]!])
        j += 1
      }
    }
    push('lost', middleA.slice(i))
    push('back', middleB.slice(j))
  }
  push('same', a.slice(endA))
  return out
}

/** The numbers for a version's summary: words only in the current text and words only in the earlier one. */
export function diffCounts(pieces: readonly DiffPiece[]): { lost: number; back: number } {
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length
  let lost = 0
  let back = 0
  for (const piece of pieces) {
    if (piece.kind === 'lost') lost += words(piece.text)
    else if (piece.kind === 'back') back += words(piece.text)
  }
  return { lost, back }
}
