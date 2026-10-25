/**
 * The identity of a numbered thing: its label, made when the thing is placed. A figure,
 * a table, and a block formula get `fig-`, `tbl-`, and `eq-` and six random letters and digits, such
 * as `tbl-k4x9tm`. It has nothing to do with the image file, the caption, or the source, so those
 * can change later without a cross-reference losing its target.
 */

export type IdPrefix = 'fig' | 'tbl' | 'eq'

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A new id that no label of `doc` has. The project's other sheets are not asked: six characters
 * make a clash with one of them very unlikely, and the cross-reference picker shows what a label
 * points at. `random` is only given in tests.
 */
export function newId(prefix: IdPrefix, doc: string, random: () => number = Math.random): string {
  const taken = new Set([...doc.matchAll(/<([\p{L}\p{N}_:.-]+)>/gu)].map((m) => m[1]))
  for (;;) {
    let id = ''
    for (let i = 0; i < 6; i += 1) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)]
    if (!taken.has(`${prefix}-${id}`)) return `${prefix}-${id}`
  }
}
