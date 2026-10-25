/**
 * The elements of a template and the properties each can have. The engine styles every
 * element of a document (the body text, each level of heading, quotes, figures, tables, footnotes,
 * the title page, and so on) through one vocabulary of properties: a font, a size, a weight, a
 * colour, the space above and below, an indent, and so on. A template's `style.toml` sets values
 * per element; an element that sets none inherits from its parent (a level-2 heading from
 * "heading", which inherits from the body text), so a change made high up reaches everything under
 * it. The registry here is the one list the engine, the validation and the template editor all read.
 *
 * A style is data from a file that may have come from somebody else: `style.ts` checks its values
 * against strict patterns and writes them into the compiler's input as literals of their type, never
 * as code, so nothing in a style can run anything.
 */

export type PropType = 'font' | 'length' | 'color' | 'bool' | 'enum' | 'text'

export interface PropDef {
  id: string
  type: PropType
  de: string
  en: string
  /** The values of an `enum`. */
  values?: readonly string[]
  /** What each value of an `enum` is called. */
  valueLabels?: Readonly<Record<string, { de: string; en: string }>>
}

const SLOTS = ['none', 'page', 'chapter', 'section', 'title', 'author'] as const
const WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const
const ALIGNS = ['left', 'center', 'right'] as const

const SLOT_LABELS: Record<string, { de: string; en: string }> = {
  none: { de: 'Leer', en: 'Empty' },
  page: { de: 'Seitenzahl', en: 'Page number' },
  chapter: { de: 'Kapitel', en: 'Chapter' },
  section: { de: 'Abschnitt', en: 'Section' },
  title: { de: 'Titel der Arbeit', en: 'Title of the work' },
  author: { de: 'Autorin oder Autor', en: 'Author' },
}

const NUMBER_FORMAT_LABELS: Record<string, { de: string; en: string }> = {
  arabic: { de: '1, 2, 3', en: '1, 2, 3' },
  roman: { de: 'I, II, III', en: 'I, II, III' },
  roman_lower: { de: 'i, ii, iii', en: 'i, ii, iii' },
  alpha: { de: 'A, B, C', en: 'A, B, C' },
  alpha_lower: { de: 'a, b, c', en: 'a, b, c' },
}

const VALUE_LABELS: Record<string, Record<string, { de: string; en: string }>> = {
  weight: {
    regular: { de: 'Normal', en: 'Regular' },
    medium: { de: 'Mittel', en: 'Medium' },
    semibold: { de: 'Halbfett', en: 'Semibold' },
    bold: { de: 'Fett', en: 'Bold' },
  },
  align: {
    left: { de: 'Links', en: 'Left' },
    center: { de: 'Zentriert', en: 'Centered' },
    right: { de: 'Rechts', en: 'Right' },
  },
  text_case: {
    normal: { de: 'Normal', en: 'Normal' },
    upper: { de: 'Versalien', en: 'All caps' },
    smallcaps: { de: 'Kapitälchen', en: 'Small caps' },
  },
  placement: {
    bottom: { de: 'Unten auf der Seite', en: 'At the foot of the page' },
    margin: { de: 'Am Rand (Tufte-Stil)', en: 'In the margin (Tufte style)' },
  },
  facing: {
    facing: { de: 'Doppelseiten (Buchsatz)', en: 'Facing pages (book)' },
    single: { de: 'Einzelseiten', en: 'Single pages' },
  },
  paper: {
    a3: { de: 'A3', en: 'A3' },
    a4: { de: 'A4', en: 'A4' },
    a5: { de: 'A5', en: 'A5' },
    b5: { de: 'B5', en: 'B5' },
    'us-letter': { de: 'US Letter', en: 'US Letter' },
    'us-legal': { de: 'US Legal', en: 'US Legal' },
  },
  columns: {
    '1': { de: 'Eine', en: 'One' },
    '2': { de: 'Zwei', en: 'Two' },
    '3': { de: 'Drei', en: 'Three' },
  },
  slot_left: SLOT_LABELS,
  slot_center: SLOT_LABELS,
  slot_right: SLOT_LABELS,
  page_style: {
    plain: { de: 'Nur die Zahl (3)', en: 'The number only (3)' },
    dashes: { de: 'Mit Strichen (– 3 –)', en: 'With dashes (– 3 –)' },
    prefix: { de: 'Mit Wort (Seite 3)', en: 'With a word (Page 3)' },
  },
  front_format: NUMBER_FORMAT_LABELS,
  break_before: {
    none: { de: 'Kein Umbruch', en: 'No break' },
    page: { de: 'Neue Seite', en: 'New page' },
    odd: { de: 'Neue rechte Seite (mit Leerseite)', en: 'New right-hand page (with a blank page)' },
  },
  caption_position: {
    below: { de: 'Unter dem Objekt', en: 'Below' },
    above: { de: 'Über dem Objekt', en: 'Above' },
  },
  caption_separator: {
    colon: { de: 'Doppelpunkt (Abbildung 1: Text)', en: 'Colon (Figure 1: Text)' },
    period: { de: 'Punkt (Abbildung 1. Text)', en: 'Period (Figure 1. Text)' },
    dash: { de: 'Strich (Abbildung 1 – Text)', en: 'Dash (Figure 1 – Text)' },
    space: { de: 'Leerzeichen (Abbildung 1 Text)', en: 'Space (Figure 1 Text)' },
  },
  marker: {
    default: { de: 'Standard (•, ‣, –)', en: 'Standard (•, ‣, –)' },
    bullet: { de: 'Punkt (•)', en: 'Bullet (•)' },
    dash: { de: 'Strich (–)', en: 'Dash (–)' },
    circle: { de: 'Kreis (◦)', en: 'Circle (◦)' },
    square: { de: 'Quadrat (▪)', en: 'Square (▪)' },
  },
  enum_format: {
    arabic_dot: { de: '1. 2. 3.', en: '1. 2. 3.' },
    arabic_paren: { de: '1) 2) 3)', en: '1) 2) 3)' },
    arabic_brackets: { de: '(1) (2) (3)', en: '(1) (2) (3)' },
    letter_paren: { de: 'a) b) c)', en: 'a) b) c)' },
    letter_dot: { de: 'a. b. c.', en: 'a. b. c.' },
    letter_upper_dot: { de: 'A. B. C.', en: 'A. B. C.' },
    roman_dot: { de: 'i. ii. iii.', en: 'i. ii. iii.' },
  },
  number_side: {
    right: { de: 'Rechts', en: 'Right' },
    left: { de: 'Links', en: 'Left' },
  },
  number_separator: {
    point: { de: 'Punkt (1.2)', en: 'Point (1.2)' },
    dash: { de: 'Bindestrich (1-2)', en: 'Hyphen (1-2)' },
    space: { de: 'Leerzeichen (1 2)', en: 'Space (1 2)' },
  },
  number_suffix: {
    none: { de: 'Keiner', en: 'None' },
    point: { de: 'Punkt (1.)', en: 'Point (1.)' },
    paren: { de: 'Klammer (1)', en: 'Bracket (1)' },
  },
  number_style: {
    inline: { de: 'Fortlaufend', en: 'Inline' },
    hanging: { de: 'Hängend', en: 'Hanging' },
  },
  border_style: {
    rows: { de: 'Linien zwischen den Zeilen', en: 'Rules between rows' },
    booktabs: { de: 'Wissenschaftlich (3 Linien)', en: 'Booktabs (3 rules)' },
    grid: { de: 'Gitter', en: 'Grid' },
    none: { de: 'Keine', en: 'None' },
  },
  cell_align: {
    left: { de: 'Links', en: 'Left' },
    center: { de: 'Zentriert', en: 'Centered' },
    right: { de: 'Rechts', en: 'Right' },
  },
  leader: {
    dots: { de: 'Punkte', en: 'Dots' },
    none: { de: 'Keine', en: 'None' },
  },
  show_depth: {
    '1': { de: 'Nur Ebene 1', en: 'Level 1 only' },
    '2': { de: 'Bis Ebene 2', en: 'Down to level 2' },
    '3': { de: 'Bis Ebene 3', en: 'Down to level 3' },
    '4': { de: 'Bis Ebene 4', en: 'Down to level 4' },
    '6': { de: 'Alle Ebenen', en: 'All levels' },
  },
  chapter_weight: {
    regular: { de: 'Normal', en: 'Regular' },
    medium: { de: 'Mittel', en: 'Medium' },
    semibold: { de: 'Halbfett', en: 'Semibold' },
    bold: { de: 'Fett', en: 'Bold' },
  },
  number_format: NUMBER_FORMAT_LABELS,
  number_depth: {
    '0': { de: 'Keine Nummerierung', en: 'No numbering' },
    '1': { de: 'Nur Ebene 1 (Kapitel)', en: 'Level 1 only (chapters)' },
    '2': { de: 'Bis Ebene 2', en: 'Down to level 2' },
    '3': { de: 'Bis Ebene 3', en: 'Down to level 3' },
    '4': { de: 'Bis Ebene 4', en: 'Down to level 4' },
    '5': { de: 'Bis Ebene 5', en: 'Down to level 5' },
    '6': { de: 'Alle Ebenen', en: 'All levels' },
  },
}

const prop = (
  id: string,
  type: PropType,
  de: string,
  en: string,
  values?: readonly string[],
): PropDef => ({
  id,
  type,
  de,
  en,
  ...(values ? { values, valueLabels: VALUE_LABELS[id] } : {}),
})

/** The families Typst brings with it: what a template can use without adding fonts. */
export const EMBEDDED_FONTS: readonly string[] = [
  'Libertinus Serif',
  'New Computer Modern',
  'DejaVu Sans Mono',
]

export const PROPS: Record<string, PropDef> = Object.fromEntries(
  [
    prop('font', 'font', 'Schriftart', 'Typeface'),
    prop('size', 'length', 'Größe', 'Size'),
    prop('weight', 'enum', 'Schnitt', 'Weight', WEIGHTS),
    prop('italic', 'bool', 'Kursiv', 'Italic'),
    prop('letter_spacing', 'length', 'Zeichenabstand', 'Letter spacing'),
    prop('text_case', 'enum', 'Schreibweise', 'Letter case', ['normal', 'upper', 'smallcaps']),
    prop('color', 'color', 'Farbe', 'Colour'),
    prop('align', 'enum', 'Ausrichtung', 'Alignment', ALIGNS),
    prop('above', 'length', 'Abstand davor', 'Space above'),
    prop('below', 'length', 'Abstand danach', 'Space below'),
    prop('indent_left', 'length', 'Einzug links', 'Indent left'),
    prop('indent_right', 'length', 'Einzug rechts', 'Indent right'),
    prop('line_spacing', 'length', 'Zeilenabstand', 'Line spacing'),
    prop('line_spacing_wide', 'length', 'Zeilenabstand (weit)', 'Line spacing (wide)'),
    prop('paragraph_spacing', 'length', 'Abstand zwischen Absätzen', 'Space between paragraphs'),
    prop('first_line_indent', 'length', 'Einzug der ersten Zeile', 'First-line indent'),
    prop('justify', 'bool', 'Blocksatz', 'Justified'),
    prop('hyphenate', 'bool', 'Silbentrennung', 'Hyphenation'),
    prop('keep_with_next', 'bool', 'Mit dem Folgenden zusammenhalten', 'Keep with what follows'),
    prop('break_before', 'enum', 'Umbruch davor', 'Break before', ['none', 'page', 'odd']),
    prop('number_format', 'enum', 'Zahlenformat', 'Number format', [
      'arabic',
      'roman',
      'roman_lower',
      'alpha',
      'alpha_lower',
    ]),
    prop('number_separator', 'enum', 'Trenner der Ebenen', 'Separator of levels', [
      'point',
      'dash',
      'space',
    ]),
    prop('number_prefix', 'text', 'Text vor der Nummer', 'Text before the number'),
    prop('number_suffix', 'enum', 'Zeichen nach der Nummer', 'Mark after the number', [
      'none',
      'point',
      'paren',
    ]),
    prop('number_gap', 'length', 'Abstand zum Titel', 'Gap to the title'),
    prop('number_style', 'enum', 'Umbruch langer Titel', 'Long titles', ['inline', 'hanging']),
    prop('border_style', 'enum', 'Linien', 'Rules', ['rows', 'booktabs', 'grid', 'none']),
    prop('cell_align', 'enum', 'Ausrichtung der Zellen', 'Cell alignment', [
      'left',
      'center',
      'right',
    ]),
    prop('header_fill', 'color', 'Hintergrund der Kopfzeile', 'Header background'),
    prop('header_bold', 'bool', 'Kopfzeile fett', 'Bold header'),
    prop(
      'stripe_fill',
      'color',
      'Hintergrund jeder zweiten Zeile',
      'Background of every second row',
    ),
    prop('padding', 'length', 'Innenabstand', 'Padding'),
    prop('bar', 'bool', 'Balken links', 'Bar at the left'),
    prop('bar_color', 'color', 'Farbe', 'Colour'),
    prop('bar_thickness', 'length', 'Stärke', 'Thickness'),
    prop('bar_gap', 'length', 'Abstand zum Text', 'Distance to the text'),
    prop('show_depth', 'enum', 'Ebenen anzeigen', 'Levels shown', ['1', '2', '3', '4', '6']),
    prop('leader', 'enum', 'Füllzeichen vor der Seitenzahl', 'Leader before the page number', [
      'dots',
      'none',
    ]),
    prop('chapter_weight', 'enum', 'Schnitt der Kapitel', 'Weight of chapters', [
      'regular',
      'medium',
      'semibold',
      'bold',
    ]),
    prop('title_text', 'text', 'Titel', 'Title'),
    // A list of figures or of tables has a title property of its own, so it does not take the contents'.
    prop('list_title', 'text', 'Titel', 'Title'),
    prop('marker', 'enum', 'Aufzählungszeichen', 'Bullet', [
      'default',
      'bullet',
      'dash',
      'circle',
      'square',
    ]),
    prop('enum_format', 'enum', 'Nummerierte Listen', 'Numbered lists', [
      'arabic_dot',
      'arabic_paren',
      'arabic_brackets',
      'letter_paren',
      'letter_dot',
      'letter_upper_dot',
      'roman_dot',
    ]),
    prop('marker_gap', 'length', 'Abstand zum Text', 'Distance to the text'),
    prop('item_spacing', 'length', 'Abstand zwischen den Punkten', 'Space between items'),
    prop('note_gap', 'length', 'Abstand zwischen den Fußnoten', 'Space between footnotes'),
    prop('note_indent', 'length', 'Einzug der Fußnoten', 'Indent of footnotes'),
    prop('number_side', 'enum', 'Stellung der Nummer', 'Place of the number', ['right', 'left']),
    prop('radius', 'length', 'Eckenradius', 'Corner radius'),
    prop('accent', 'color', 'Akzentfarbe', 'Accent colour'),
    prop('accent_secondary', 'color', 'Zweitfarbe', 'Second colour'),
    prop('caption_position', 'enum', 'Stellung', 'Position', ['below', 'above']),
    prop('caption_separator', 'enum', 'Zeichen nach der Nummer', 'Mark after the number', [
      'colon',
      'period',
      'dash',
      'space',
    ]),
    prop('supplement_section', 'text', 'Wort für Abschnitte', 'Word for sections'),
    prop('supplement_figure', 'text', 'Wort für Abbildungen', 'Word for figures'),
    prop('supplement_table', 'text', 'Wort für Tabellen', 'Word for tables'),
    prop('supplement_equation', 'text', 'Wort für Gleichungen', 'Word for equations'),
    prop('hanging_indent', 'length', 'Einzug ab der zweiten Zeile', 'Indent from the second line'),
    prop('entry_spacing', 'length', 'Abstand zwischen den Einträgen', 'Space between entries'),
    prop('slot_left', 'enum', 'Links', 'Left', SLOTS),
    prop('slot_center', 'enum', 'Mitte', 'Centre', SLOTS),
    prop('slot_right', 'enum', 'Rechts', 'Right', SLOTS),
    prop('mirror', 'bool', 'Auf geraden Seiten spiegeln', 'Mirror on even pages'),
    prop('skip_chapter_start', 'bool', 'Nicht auf Kapitelseiten', 'Not on chapter pages'),
    prop('show_number', 'bool', 'Nummer des Kapitels zeigen', 'Show the chapter number'),
    prop('distance', 'length', 'Abstand zum Textbereich', 'Distance to the text area'),
    prop('divider', 'bool', 'Trennlinie', 'Divider line'),
    prop('divider_color', 'color', 'Farbe', 'Colour'),
    prop('divider_thickness', 'length', 'Stärke', 'Thickness'),
    prop('divider_gap', 'length', 'Abstand zum Text', 'Distance to the text'),
    prop('page_style', 'enum', 'Darstellung', 'Style', ['plain', 'dashes', 'prefix']),
    prop('front_format', 'enum', 'Zahlenformat im Vorspann', 'Number format in the front matter', [
      'arabic',
      'roman',
      'roman_lower',
      'alpha',
      'alpha_lower',
    ]),
    prop('number_depth', 'enum', 'Nummerieren bis', 'Number down to', [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]),
    prop('line_above', 'bool', 'Linie über der Überschrift', 'Line above the heading'),
    prop('line_above_color', 'color', 'Farbe', 'Colour'),
    prop('line_above_thickness', 'length', 'Stärke', 'Thickness'),
    prop('line_above_width', 'length', 'Länge', 'Length'),
    prop('line_above_distance', 'length', 'Abstand zum Text', 'Distance to the text'),
    prop('line_below', 'bool', 'Linie unter der Überschrift', 'Line below the heading'),
    prop('line_below_color', 'color', 'Farbe', 'Colour'),
    prop('line_below_thickness', 'length', 'Stärke', 'Thickness'),
    prop('line_below_width', 'length', 'Länge', 'Length'),
    prop('line_below_distance', 'length', 'Abstand zum Text', 'Distance to the text'),
    prop('width', 'length', 'Breite', 'Width'),
    prop('inset', 'length', 'Zellabstand', 'Cell padding'),
    prop('rule_width', 'length', 'Linienstärke', 'Rule weight'),
    prop('rule_strong_width', 'length', 'Linienstärke (Kopfzeile)', 'Rule weight (header)'),
    prop('rule_length', 'length', 'Linienlänge', 'Rule length'),
    prop('underline', 'bool', 'Unterstrichen', 'Underlined'),
    prop('fill', 'color', 'Hintergrund', 'Background'),
    prop('margin_top', 'length', 'Rand oben', 'Top margin'),
    prop('margin_bottom', 'length', 'Rand unten', 'Bottom margin'),
    prop(
      'margin_inside',
      'length',
      'Rand innen (links bei Einzelseiten)',
      'Inside margin (left on single pages)',
    ),
    prop(
      'margin_outside',
      'length',
      'Rand außen (rechts bei Einzelseiten)',
      'Outside margin (right on single pages)',
    ),
    prop('placement', 'enum', 'Platzierung', 'Placement', ['bottom', 'margin']),
    prop('margin_width', 'length', 'Breite der Randspalte', 'Width of the margin column'),
    prop(
      'margin_gap',
      'length',
      'Abstand der Randspalte zum Text',
      'Distance of the margin column to the text',
    ),
    prop('facing', 'enum', 'Seitenanordnung', 'Page layout', ['facing', 'single']),
    prop('paper', 'enum', 'Papierformat', 'Paper size', [
      'a3',
      'a4',
      'a5',
      'b5',
      'us-letter',
      'us-legal',
    ]),
    prop('columns', 'enum', 'Spalten', 'Columns', ['1', '2', '3']),
    prop('column_gap', 'length', 'Spaltenabstand', 'Column gap'),
    prop('span_columns', 'bool', 'Über alle Spalten', 'Across all columns'),
    prop('space_above', 'length', 'Abstand oben', 'Space at the top'),
    prop('indent', 'length', 'Einzug', 'Indent'),
  ].map((p) => [p.id, p]),
)

export interface ElementDef {
  id: string
  /** Where an unset property comes from: null for the roots. */
  parent: string | null
  group: string
  de: string
  en: string
  props: readonly string[]
  /** What an unset property is before the parent is asked: a value, or `null` for "inherit, else leave it to the compiler". */
  defaults: Readonly<Record<string, string | boolean | null>>
}

export const GROUPS: readonly { id: string; de: string; en: string }[] = [
  { id: 'page', de: 'Seite', en: 'Page' },
  { id: 'title', de: 'Titelseite', en: 'Title page' },
  { id: 'text', de: 'Text', en: 'Text' },
  { id: 'headings', de: 'Überschriften', en: 'Headings' },
  { id: 'lists', de: 'Listen', en: 'Lists' },
  { id: 'quotes', de: 'Zitate', en: 'Quotes' },
  { id: 'references', de: 'Verweise', en: 'References' },
  { id: 'indexes', de: 'Verzeichnisse', en: 'Contents and indexes' },
  { id: 'tables', de: 'Tabellen', en: 'Tables' },
  { id: 'figures', de: 'Abbildungen', en: 'Figures' },
  { id: 'equations', de: 'Formeln', en: 'Equations' },
  { id: 'code', de: 'Code', en: 'Code' },
]

/**
 * Elements the editor shows inside another's entry, below its own properties: the source of an
 * epigraph with the epigraph, a caption with its figure or table, the parts of the title page with
 * the title page. They are elements of their own in the style (so a template that sets them keeps
 * working); only the list of entries is shorter.
 */
export const SUB_ELEMENTS: Readonly<Record<string, readonly string[]>> = {
  epigraph: ['epigraph_source'],
  figure: ['figure_caption'],
  table: ['table_caption'],
  title_page: ['title_page_title', 'title_page_subtitle', 'title_page_author', 'title_page_date'],
}

const SUB_IDS = new Set(Object.values(SUB_ELEMENTS).flat())
/** The elements that have an entry of their own in the editor's list. */
export const isListed = (id: string): boolean => !SUB_IDS.has(id)

const el = (
  id: string,
  parent: string | null,
  group: string,
  de: string,
  en: string,
  props: readonly string[],
  defaults: ElementDef['defaults'] = {},
): ElementDef => ({ id, parent, group, de, en, props, defaults })

const TEXT = ['font', 'size', 'weight', 'italic', 'color'] as const

/**
 * A decorative line: a switch and the properties of the line, drawn a `distance` from the text and
 * as long as `width` says. The space above and below the heading (`above`, `below`) is counted from
 * the outer side of the line. The editor shows each as a card of its own.
 */
export interface LineSection {
  toggle: string
  fields: readonly string[]
}
const lineSection = (toggle: string, fields: readonly string[]): LineSection => ({
  toggle,
  fields: fields.map((field) => `${toggle}_${field}`),
})
/** The lines above and below a heading. */
const HEADING_LINES: readonly LineSection[] = ['above', 'below'].map((side) =>
  lineSection(`line_${side}`, ['color', 'thickness', 'width', 'distance']),
)
/** The bar at the left of a block quote. */
const BAR = lineSection('bar', ['color', 'thickness', 'gap'])
/** The divider between a header or footer and the text. */
const DIVIDER = lineSection('divider', ['color', 'thickness', 'gap'])
export const LINE_SECTIONS: readonly LineSection[] = [...HEADING_LINES, BAR, DIVIDER]
const idsOf = (sections: readonly LineSection[]): string[] =>
  sections.flatMap((section) => [section.toggle, ...section.fields])
const LINE_PROPS = idsOf(HEADING_LINES)
const BAR_PROPS = idsOf([BAR])
const DIVIDER_PROPS = idsOf([DIVIDER])

/**
 * How the editor groups the properties of an element: the type, the arrangement, numbering and
 * breaks. A property in none of them goes to a last group, and the lines of a heading are their own.
 */
export const PROP_SECTIONS: readonly {
  id: string
  de: string
  en: string
  props: readonly string[]
}[] = [
  {
    id: 'type',
    de: 'Schrift',
    en: 'Type',
    props: [
      'font',
      'size',
      'weight',
      'italic',
      'color',
      'text_case',
      'letter_spacing',
      'underline',
    ],
  },
  {
    id: 'arrangement',
    de: 'Anordnung',
    en: 'Arrangement',
    props: [
      'align',
      'justify',
      'hyphenate',
      'above',
      'below',
      'space_above',
      'indent_left',
      'indent_right',
      'first_line_indent',
      'line_spacing',
      'line_spacing_wide',
      'paragraph_spacing',
      'width',
    ],
  },
  {
    id: 'numbering',
    de: 'Nummerierung und Umbruch',
    en: 'Numbering and breaks',
    props: [
      'number_depth',
      'number_format',
      'number_separator',
      'number_prefix',
      'number_suffix',
      'number_gap',
      'number_style',
      'page_style',
      'front_format',
      'keep_with_next',
      'break_before',
    ],
  },
  {
    id: 'running',
    de: 'Inhalt',
    en: 'Content',
    props: [
      'slot_left',
      'slot_center',
      'slot_right',
      'mirror',
      'skip_chapter_start',
      'show_number',
      'distance',
    ],
  },
  { id: 'box', de: 'Fläche', en: 'Box', props: ['fill', 'padding'] },
  {
    id: 'words',
    de: 'Wörter',
    en: 'Words',
    props: ['supplement_section', 'supplement_figure', 'supplement_table', 'supplement_equation'],
  },
  {
    id: 'list',
    de: 'Listen',
    en: 'Lists',
    props: ['marker', 'enum_format', 'marker_gap', 'item_spacing'],
  },
  {
    id: 'placement',
    de: 'Platzierung',
    en: 'Placement',
    props: ['placement', 'margin_width', 'margin_gap'],
  },
  { id: 'notes', de: 'Abstände', en: 'Spacing', props: ['note_gap', 'note_indent'] },
  { id: 'equation', de: 'Nummer', en: 'Number', props: ['number_side'] },
  {
    id: 'caption',
    de: 'Beschriftung',
    en: 'Caption',
    props: ['caption_position', 'caption_separator'],
  },
  {
    id: 'table',
    de: 'Linien und Zellen',
    en: 'Rules and cells',
    props: ['border_style', 'rule_width', 'rule_strong_width', 'inset', 'cell_align'],
  },
  {
    id: 'tablehead',
    de: 'Kopfzeile und Streifen',
    en: 'Header and stripes',
    props: ['header_fill', 'header_bold', 'stripe_fill'],
  },
  {
    id: 'toc',
    de: 'Verzeichnis',
    en: 'List',
    props: [
      'title_text',
      'list_title',
      'show_depth',
      'indent',
      'leader',
      'chapter_weight',
      'hanging_indent',
      'entry_spacing',
    ],
  },
  { id: 'format', de: 'Format', en: 'Format', props: ['paper', 'facing'] },
  {
    id: 'margins',
    de: 'Ränder',
    en: 'Margins',
    props: ['margin_top', 'margin_bottom', 'margin_inside', 'margin_outside'],
  },
  {
    id: 'columns',
    de: 'Spalten',
    en: 'Columns',
    props: ['columns', 'column_gap', 'span_columns'],
  },
]

export const ELEMENTS: readonly ElementDef[] = [
  el(
    'page',
    null,
    'page',
    'Ränder und Spalten',
    'Margins and columns',
    [
      'paper',
      'facing',
      'margin_top',
      'margin_bottom',
      'margin_inside',
      'margin_outside',
      'columns',
      'column_gap',
    ],
    {
      paper: 'a4',
      facing: 'facing',
      columns: '1',
      column_gap: '1cm',
      margin_top: '2.5cm',
      margin_bottom: '2.5cm',
      margin_inside: '3cm',
      margin_outside: '2.5cm',
    },
  ),
  el(
    'body',
    null,
    'text',
    'Fließtext',
    'Body text',
    [
      ...TEXT,
      'justify',
      'hyphenate',
      'line_spacing',
      'line_spacing_wide',
      'paragraph_spacing',
      'first_line_indent',
    ],
    {
      font: 'Libertinus Serif',
      size: '11pt',
      weight: 'regular',
      italic: false,
      color: '#000000',
      justify: true,
      hyphenate: true,
      line_spacing: '0.65em',
      line_spacing_wide: '1em',
      paragraph_spacing: '0.9em',
      first_line_indent: null,
    },
  ),
  el(
    'list',
    'body',
    'lists',
    'Aufzählungen',
    'Bullets and numbers',
    ['indent_left', 'marker', 'enum_format', 'marker_gap', 'item_spacing'],
    { marker: 'default', enum_format: 'arabic_dot' },
  ),
  ...(['header', 'footer'] as const).map((id) =>
    el(
      id,
      'body',
      'page',
      id === 'header' ? 'Kopfzeile' : 'Fußzeile',
      id === 'header' ? 'Header' : 'Footer',
      [
        ...TEXT,
        'text_case',
        'letter_spacing',
        'slot_left',
        'slot_center',
        'slot_right',
        'mirror',
        'skip_chapter_start',
        'show_number',
        'distance',
        ...DIVIDER_PROPS,
      ],
      {
        size: '1em',
        slot_left: 'none',
        slot_center: id === 'footer' ? 'page' : 'none',
        slot_right: 'none',
        mirror: false,
        skip_chapter_start: false,
        show_number: true,
        distance: '30%',
        divider: false,
        divider_color: '#000000',
        divider_thickness: '0.5pt',
        divider_gap: '0.4em',
      },
    ),
  ),
  el(
    'page_number',
    null,
    'page',
    'Seitenzahl',
    'Page number',
    ['page_style', 'number_format', 'front_format'],
    { page_style: 'plain', number_format: 'arabic', front_format: 'roman_lower' },
  ),
  el(
    'heading',
    'body',
    'headings',
    'Alle Überschriften',
    'All headings',
    [
      'font',
      'weight',
      'italic',
      'text_case',
      'letter_spacing',
      'color',
      'align',
      'keep_with_next',
      'number_depth',
      'number_format',
      'number_separator',
      'number_prefix',
      'number_suffix',
      'number_gap',
      'number_style',
      ...LINE_PROPS,
    ],
    {
      weight: 'bold',
      text_case: 'normal',
      align: 'left',
      keep_with_next: true,
      number_depth: '6',
      number_format: 'arabic',
      number_separator: 'point',
      number_suffix: 'none',
      number_gap: '0.6em',
      number_style: 'inline',
      line_above: false,
      line_above_color: '#000000',
      line_above_thickness: '0.5pt',
      line_above_width: '100%',
      line_above_distance: '0.4em',
      line_below: false,
      line_below_color: '#000000',
      line_below_thickness: '0.5pt',
      line_below_width: '100%',
      line_below_distance: '0.4em',
    },
  ),
  ...[1, 2, 3, 4].map((n) =>
    el(
      `heading_${n}`,
      'heading',
      'headings',
      n === 1 ? 'Überschrift 1 (Kapitel)' : `Überschrift ${n}`,
      n === 1 ? 'Heading 1 (chapter)' : `Heading ${n}`,
      [
        'size',
        'weight',
        'italic',
        'text_case',
        'letter_spacing',
        'color',
        'align',
        'above',
        'below',
        'break_before',
        'number_format',
        'number_prefix',
        'number_suffix',
        ...LINE_PROPS,
      ],
      {
        size: ['1.9em', '1.4em', '1.15em', '1em'][n - 1]!,
        above: ['0em', '1.8em', '1.4em', '1.1em'][n - 1]!,
        below: ['1.4em', '0.9em', '0.7em', '0.6em'][n - 1]!,
        break_before: n === 1 ? 'page' : 'none',
      },
    ),
  ),
  // A quote in the text: what it leaves unset is the text around it (it may stand in a footnote or a
  // heading), so it has no parent.
  el('quote_inline', null, 'quotes', 'Zitat im Text', 'Quote in the text', [...TEXT]),
  el(
    'quote',
    'body',
    'quotes',
    'Blockzitat',
    'Block quote',
    [...TEXT, 'indent_left', 'indent_right', 'above', 'below', 'fill', 'padding', ...BAR_PROPS],
    {
      size: '0.95em',
      indent_left: '1.2em',
      indent_right: '1.2em',
      above: '1em',
      below: '1em',
      padding: '0em',
      bar: false,
      bar_color: '#000000',
      bar_thickness: '2pt',
      bar_gap: '0.8em',
    },
  ),
  el('epigraph', 'quote', 'quotes', 'Epigraph', 'Epigraph', [...TEXT, 'width', 'above', 'below'], {
    italic: true,
    width: '60%',
    above: '1.5em',
    below: '2em',
  }),
  el(
    'epigraph_source',
    'epigraph',
    'quotes',
    'Quelle des Epigraphs',
    'Epigraph source',
    [...TEXT, 'above'],
    { size: '1em', italic: false, above: '0.5em' },
  ),
  el('figure', null, 'figures', 'Abbildung', 'Figure', ['above', 'below', 'span_columns'], {
    span_columns: false,
    above: '0.8em',
    below: '0.8em',
  }),
  el(
    'figure_caption',
    'body',
    'figures',
    'Bildunterschrift',
    'Figure caption',
    [...TEXT, 'caption_position', 'caption_separator', 'align'],
    { size: '0.92em', caption_position: 'below', caption_separator: 'colon' },
  ),
  el(
    'table',
    'body',
    'tables',
    'Tabelle',
    'Table',
    [
      ...TEXT,
      'border_style',
      'inset',
      'rule_width',
      'rule_strong_width',
      'cell_align',
      'header_fill',
      'header_bold',
      'stripe_fill',
    ],
    {
      size: '1em',
      border_style: 'rows',
      header_bold: false,
      inset: '0.5em',
      rule_width: '0.5pt',
      rule_strong_width: '0.9pt',
    },
  ),
  el('table_caption', 'figure_caption', 'tables', 'Tabellenüberschrift', 'Table caption', [
    ...TEXT,
    'caption_position',
    'caption_separator',
    'align',
  ]),
  // What a cross-reference looks like (a reference to a heading, a figure, a table, a formula); what
  // it leaves unset is the text around it, so it has no parent.
  el(
    'references',
    null,
    'references',
    'Querverweise',
    'References',
    [
      'color',
      'weight',
      'italic',
      'fill',
      'underline',
      'supplement_section',
      'supplement_figure',
      'supplement_table',
      'supplement_equation',
    ],
    { underline: false },
  ),
  // What an in-text citation looks like (the citation style says what it says); what it leaves unset
  // is the text around it, so it has no parent.
  el(
    'citations',
    null,
    'references',
    'Belege',
    'Citations',
    ['color', 'weight', 'italic', 'fill', 'underline'],
    { underline: false },
  ),
  el(
    'footnote',
    'body',
    'references',
    'Fußnote',
    'Footnote',
    [
      ...TEXT,
      'placement',
      'margin_width',
      'margin_gap',
      'note_gap',
      'note_indent',
      'rule_width',
      'rule_length',
    ],
    {
      placement: 'bottom',
      margin_width: '4.5cm',
      margin_gap: '0.7cm',
      size: '0.86em',
      rule_width: '0.4pt',
      rule_length: '30%',
    },
  ),
  el(
    'contents',
    'body',
    'indexes',
    'Inhaltsverzeichnis',
    'Contents',
    [...TEXT, 'indent', 'show_depth', 'leader', 'chapter_weight', 'title_text'],
    {
      show_depth: '6',
      leader: 'dots',
      size: '1em',
      indent: '1.2em',
    },
  ),
  // The lists of figures and of tables look as the contents do, except for their own title.
  ...(
    [
      ['list_of_figures', 'Abbildungsverzeichnis', 'List of figures'],
      ['list_of_tables', 'Tabellenverzeichnis', 'List of tables'],
    ] as const
  ).map(([id, de, en]) => el(id, 'contents', 'indexes', de, en, [...TEXT, 'list_title', 'leader'])),
  el(
    'bibliography',
    'body',
    'indexes',
    'Literaturverzeichnis',
    'Bibliography',
    [...TEXT, 'title_text', 'hanging_indent', 'entry_spacing'],
    { size: '1em' },
  ),
  el(
    'code',
    'body',
    'code',
    'Code',
    'Code',
    ['font', 'size', 'color', 'fill', 'padding', 'radius'],
    {
      font: 'DejaVu Sans Mono',
      size: '0.9em',
      padding: '0em',
      radius: '0pt',
    },
  ),
  el('palette', null, 'page', 'Farben', 'Colours', ['accent', 'accent_secondary'], {
    accent: '#1a56b0',
    accent_secondary: '#666666',
  }),
  el('equation', 'body', 'equations', 'Formeln', 'Equations', ['size', 'number_side'], {
    size: '1em',
    number_side: 'right',
  }),
  el(
    'link',
    null,
    'references',
    'Links',
    'Links',
    ['color', 'weight', 'italic', 'fill', 'underline'],
    { underline: false },
  ),
  el('highlight', null, 'text', 'Markierung', 'Highlight', ['fill'], { fill: '#fff2a8' }),
  el('title_page', null, 'title', 'Titelseite', 'Title page', ['space_above'], {
    space_above: '6cm',
  }),
  el(
    'title_page_title',
    'body',
    'title',
    'Titel',
    'Title',
    ['font', 'size', 'weight', 'italic', 'letter_spacing', 'color', 'align'],
    { size: '2.6em', weight: 'bold', align: 'center' },
  ),
  el(
    'title_page_subtitle',
    'body',
    'title',
    'Untertitel',
    'Subtitle',
    ['font', 'size', 'weight', 'italic', 'letter_spacing', 'color', 'align', 'above'],
    { size: '1.3em', align: 'center', above: '0.8em' },
  ),
  el(
    'title_page_author',
    'body',
    'title',
    'Autorin oder Autor',
    'Author',
    ['font', 'size', 'weight', 'italic', 'letter_spacing', 'color', 'align', 'above'],
    { size: '1.2em', align: 'center', above: '3em' },
  ),
  el(
    'title_page_date',
    'body',
    'title',
    'Datum',
    'Date',
    ['font', 'size', 'weight', 'italic', 'letter_spacing', 'color', 'align', 'above'],
    { size: '0.9em', align: 'center', above: '2em' },
  ),
]

const BY_ID = new Map(ELEMENTS.map((e) => [e.id, e]))
export const elementById = (id: string): ElementDef | undefined => BY_ID.get(id)
