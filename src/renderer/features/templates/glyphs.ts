/** The choices drawn as small pictures, with the values each picture is for. */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  orientation: ['portrait', 'landscape'],
  facing: ['facing', 'single'],
  columns: ['1', '2', '3'],
  break_before: ['none', 'page', 'odd'],
  caption_position: ['below', 'above'],
  border_style: ['rows', 'booktabs', 'grid', 'none'],
  placement: ['bottom', 'margin'],
  separator_style: ['solid', 'dashed', 'dotted', 'none'],
  number_style: ['inline', 'hanging'],
  marker: ['default', 'bullet', 'dash', 'circle', 'square'],
}
