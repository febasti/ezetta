/**
 * Tabler icons for the editor's plain DOM (widgets and popovers are not Svelte components). The path
 * data is copied from `@tabler/icons-svelte`, which the Svelte chrome uses.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const OUTLINE = {
  message: [
    'M8 9h8',
    'M8 13h6',
    'M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12',
  ],
  flag: ['M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9', 'M5 21v-7'],
  trash: [
    'M4 7l16 0',
    'M10 11l0 6',
    'M14 11l0 6',
    'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12',
    'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
  ],
  'chevron-down': ['M6 9l6 6l6 -6'],
  replace: [
    'M3 4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
    'M15 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
    'M21 11v-3a2 2 0 0 0 -2 -2h-6l3 3m0 -6l-3 3',
    'M3 13v3a2 2 0 0 0 2 2h6l-3 -3m0 6l3 -3',
  ],
  book: [
    'M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0',
    'M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0',
    'M3 6l0 13',
    'M12 6l0 13',
    'M21 6l0 13',
  ],
  photo: [
    'M15 8h.01',
    'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12',
    'M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5',
    'M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3',
  ],
  'row-insert-top': [
    'M4 18v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1',
    'M12 9v-4',
    'M10 7l4 0',
  ],
  'row-insert-bottom': [
    'M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1',
    'M12 15l0 4',
    'M14 17l-4 0',
  ],
  'column-insert-left': [
    'M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1',
    'M5 12l4 0',
    'M7 10l0 4',
  ],
  'column-insert-right': [
    'M6 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1',
    'M15 12l4 0',
    'M17 10l0 4',
  ],
  'row-remove': [
    'M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1',
    'M10 16l4 4',
    'M10 20l4 -4',
  ],
  'column-remove': [
    'M6 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1',
    'M16 10l4 4',
    'M16 14l4 -4',
  ],
  'align-left': ['M4 6l16 0', 'M4 12l10 0', 'M4 18l14 0'],
  'align-center': ['M4 6l16 0', 'M8 12l8 0', 'M6 18l12 0'],
  'align-right': ['M4 6l16 0', 'M10 12l10 0', 'M6 18l14 0'],
  'table-row': [
    'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14',
    'M9 3l-6 6',
    'M14 3l-7 7',
    'M19 3l-7 7',
    'M21 6l-4 4',
    'M3 10h18',
    'M10 10v11',
  ],
  heading: ['M7 12h10', 'M7 5v14', 'M17 5v14', 'M15 19h4', 'M15 5h4', 'M5 19h4', 'M5 5h4'],
  table: [
    'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14',
    'M3 10h18',
    'M10 3v18',
  ],
  'math-function': [
    'M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2',
    'M5 12h6',
    'M15 12l6 6',
    'M15 18l6 -6',
  ],
  'text-caption': [
    'M4 15h16',
    'M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
    'M4 20h12',
  ],
  // The slash menu's kinds of paragraph and what it inserts.
  pilcrow: ['M13 4v16', 'M17 4v16', 'M19 4h-9.5a4.5 4.5 0 0 0 0 9h3.5'],
  'h-1': [
    'M19 18v-8l-2 2',
    'M4 6v12',
    'M12 6v12',
    'M11 18h2',
    'M3 18h2',
    'M4 12h8',
    'M3 6h2',
    'M11 6h2',
  ],
  'h-2': [
    'M17 12a2 2 0 1 1 4 0c0 .591 -.417 1.318 -.816 1.858l-3.184 4.143l4 0',
    'M4 6v12',
    'M12 6v12',
    'M11 18h2',
    'M3 18h2',
    'M4 12h8',
    'M3 6h2',
    'M11 6h2',
  ],
  'h-3': [
    'M19 14a2 2 0 1 0 -2 -2',
    'M17 16a2 2 0 1 0 2 -2',
    'M4 6v12',
    'M12 6v12',
    'M11 18h2',
    'M3 18h2',
    'M4 12h8',
    'M3 6h2',
    'M11 6h2',
  ],
  'h-4': [
    'M20 18v-8l-4 6h5',
    'M4 6v12',
    'M12 6v12',
    'M11 18h2',
    'M3 18h2',
    'M4 12h8',
    'M3 6h2',
    'M11 6h2',
  ],
  list: ['M9 6l11 0', 'M9 12l11 0', 'M9 18l11 0', 'M5 6l0 .01', 'M5 12l0 .01', 'M5 18l0 .01'],
  'list-numbers': [
    'M11 6h9',
    'M11 12h9',
    'M12 18h8',
    'M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4',
    'M6 10v-6l-2 2',
  ],
  blockquote: [
    'M6 15h15',
    'M21 19h-15',
    'M15 11h6',
    'M21 7h-6',
    'M9 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2',
    'M3 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2',
  ],
  quote: [
    'M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5',
    'M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5',
  ],
  asterisk: [
    'M12 12l8 -4.5',
    'M12 12v9',
    'M12 12l-8 -4.5',
    'M12 12l8 4.5',
    'M12 3v9',
    'M12 12l-8 4.5',
  ],
  tag: [
    'M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3',
  ],
  math: ['M19 5h-7l-4 14l-3 -6h-2', 'M14 13l6 6', 'M14 19l6 -6'],
  link: [
    'M9 15l6 -6',
    'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464',
    'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463',
  ],
  separator: ['M3 12l0 .01', 'M7 12l10 0', 'M21 12l0 .01'],
} as const

const FILLED = {
  flag: [
    'M4 5a1 1 0 0 1 .3 -.714a6 6 0 0 1 8.213 -.176l.351 .328a4 4 0 0 0 5.272 0l.249 -.227c.61 -.483 1.527 -.097 1.61 .676l.005 .113v9a1 1 0 0 1 -.3 .714a6 6 0 0 1 -8.213 .176l-.351 -.328a4 4 0 0 0 -5.136 -.114v6.552a1 1 0 0 1 -1.993 .117l-.007 -.117v-16z',
  ],
} as const

export type IconName = keyof typeof OUTLINE

/** The icon of each kind of cross-reference target. */
export const TARGET_ICONS = {
  sec: 'heading',
  fig: 'photo',
  tbl: 'table',
  eq: 'math-function',
} as const satisfies Record<string, IconName>

/** An icon in `currentColor`, hidden from screen readers (the control around it has the label). */
export function icon(
  name: IconName | `${keyof typeof FILLED}-filled`,
  size: number,
  className = '',
): SVGElement {
  const filled = name.endsWith('-filled')
  const paths = filled
    ? FILLED[name.slice(0, -'-filled'.length) as keyof typeof FILLED]
    : OUTLINE[name as IconName]
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  if (className) svg.setAttribute('class', className)
  if (filled) svg.setAttribute('fill', 'currentColor')
  else {
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.75')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
