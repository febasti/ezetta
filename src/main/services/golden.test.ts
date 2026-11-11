import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MAIN_FILE } from '@core/export/build'
import { defaultProfile } from '@core/export/profile'
import type { ExportProfile } from '@core/export/profile'
import { mergeSets, parseSets, setsToToml } from '@core/export/custom'
import type { Sets } from '@core/export/custom'
import { resolveOptions } from '@core/export/template'
import { ProjectSession } from '@core/project/session'
import { loadTemplates } from './exporter'
import { findTypst } from './mathRenderer'
import { createRootedFs } from './rootedFs'

/**
 * Golden tests of the export: a fixture project is exported with each bundled template
 * and the pages are compared with what they were. Each page is made as SVG by the bundled Typst
 * (no rasterising, so the same on every machine for the same Typst version and fonts) and hashed.
 * A change that moves anything on a page changes its hash and fails here; after a change that is
 * meant, `UPDATE_GOLDEN=1 npm test` writes the new hashes, and the diff of `tests/golden` shows
 * which pages moved. Needs the `typst` command, in the version the app ships (another version sets
 * the pages a little differently and writes other SVG, so every hash would differ).
 */

/** The Typst the app ships (`scripts/package-resources.mjs`). */
const TYPST_VERSION = '0.15.1'
const binary = findTypst({ override: process.env['EZETTA_TYPST'] })
const installed = binary !== 'typst'
const version = installed ? execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim() : ''
const pinned = version.split(' ')[1] === TYPST_VERSION
const GOLDEN = resolve('tests/golden')
// GOLDEN_TEMPLATES points at another copy of the templates folder, GOLDEN_DUMP at a folder that
// receives the SVG pages: for finding out what a change moved.
const TEMPLATES = resolve(process.env['GOLDEN_TEMPLATES'] ?? 'templates')
const update = process.env['UPDATE_GOLDEN'] === '1'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const BIB =
  '@book{smith2020, author = {Smith, Anna}, title = {Eine Studie}, year = {2020}, publisher = {Verlag}}\n' +
  '@article{jones2019, author = {Jones, Mary and Müller, Jörg}, title = {Ein Aufsatz}, journal = {Zeitschrift}, year = {2019}}\n'

const LONG =
  'Dieser Absatz ist lang genug, um mehrere Zeilen zu füllen und zu zeigen, wie der Text gesetzt ist, ' +
  'wie die Silben getrennt werden und wie der Blocksatz aussieht, wenn viele Wörter hintereinander stehen. '

const SHEETS: Record<string, string> = {
  'einleitung/einleitung.typ': [
    '= Einleitung <sec-einleitung>',
    '',
    `${LONG}${LONG} Ein Beleg @smith2020[S. 4] und mehrere @smith2020 @jones2019 stehen im Text.#footnote[Eine Fußnote mit @jones2019.]`,
    '',
    `${LONG}Eine _betonte_ und eine *wichtige* Stelle, ein ::markierter:: Text, ein #highlight[zweiter] und ein Link: #link("https://example.org")[Beispiel].`,
    '',
    '/* Ein offener Kommentar im Text */',
    '',
    '== Fragestellung <sec-frage>',
    '',
    `${LONG}`,
    '',
    '=== Teilfrage',
    '',
    `${LONG}`,
    '',
    '==== Unterfrage',
    '',
    `${LONG}`,
    '',
    '- Erster Punkt der Liste',
    '- Zweiter Punkt mit etwas mehr Text, der über mehr als eine Zeile gehen könnte, wenn er lang genug ist',
    '+ Erster nummerierter Punkt',
    '+ Zweiter nummerierter Punkt',
  ].join('\n'),
  'methoden/design.typ': [
    '= Methoden <sec-methoden>',
    '',
    `Siehe @sec-einleitung, @sec-frage, @eq-energie, @fig-bild und @tbl-werte. ${LONG}`,
    '',
    '#quote(block: true, attribution: [@smith2020[S. 12]])[Ein langes Zitat, das in einem eigenen Block steht und über mehrere Zeilen geht, damit man den Einzug sieht.]',
    '',
    `Dazu ein Zitat im Text: #quote[ein kurzes Zitat] @jones2019.`,
    '',
    '$ E = m c^2 + sum_(i=1)^n a_i $ <eq-energie>',
    '',
    'Und eine Formel im Text $x^2 + y^2 = z^2$ mit ```raw code``` daneben.',
    '',
    '#figure(image("assets/bild.png", width: 40%), caption: [Ein Bild]) <fig-bild>',
    '',
    '#figure(table(columns: 3, table.header[A][B][C], [1], [2], [3], [4], [5], [6]), caption: [Werte]) <tbl-werte>',
    '',
    '#quote(block: true, attribution: [Goethe, _Faust_])[Habe nun, ach! Philosophie, Juristerei und Medizin.] <epigraph>',
    '',
    `${LONG}${LONG}${LONG}`,
  ].join('\n'),
}

const VARIANTS: {
  name: string
  template: string
  options: Record<string, string | boolean>
  comments?: ExportProfile['comments']
  marks?: ExportProfile['marks']
  hyphenate?: ExportProfile['hyphenate']
  binding?: ExportProfile['binding']
  /** Values set on top of the template's style, as a writer's own template would. */
  sets?: Sets
  /** Sheets added to the fixture for this variant, by path under `content/`. */
  extraSheets?: Record<string, string>
  /** The bibliography file, when it is not the usual one. */
  bib?: string
  /** The title page fields beyond author and subtitle, and the texts of the Titelei by slot. */
  titelei?: {
    authors?: { name: string; affiliation: string }[]
    date?: string
    version?: string
    parts?: Record<string, string>
  }
}[] = [
  {
    name: 'monographie',
    template: 'monographie',
    options: { author: 'A. Autor', subtitle: 'Eine Untersuchung' },
  },
  {
    name: 'monographie-titelei',
    template: 'monographie',
    options: { subtitle: 'Eine Untersuchung' },
    titelei: {
      authors: [
        { name: 'A. Autor', affiliation: 'Universität Beispiel' },
        { name: 'B. Beispiel', affiliation: '' },
      ],
      date: '2026-10-31',
      version: '1.2',
      parts: {
        dedication: 'Für alle, die zuhören.',
        abstract: 'Die Arbeit untersucht, wie sich der Blick des Erzählers verändert. @smith2020',
        preface: 'Dieses Buch ist aus Vorlesungen entstanden.\n\nEs will etwas anderes sein.',
        acknowledgements: 'Mein Dank gilt allen, die gelesen haben.',
      },
    },
  },
  {
    name: 'monographie-weit',
    template: 'monographie',
    options: {
      author: 'A. Autor',
      list_of_figures: true,
      list_of_tables: true,
      line_height: '1.5',
    },
    sets: { body: { size: '12pt' } },
  },
  {
    name: 'monographie-verzeichnisse',
    template: 'monographie',
    options: { author: 'A. Autor', list_of_figures: true, list_of_tables: true },
    sets: {
      list_of_figures: { list_title: 'Bilder', size: '0.9em', leader: 'none' },
      list_of_tables: { italic: true },
      citations: { color: '#b00020', fill: '#e8f0fe', underline: true },
    },
  },
  { name: 'monographie-bindung', template: 'monographie', options: {}, binding: '1.5cm' },
  {
    name: 'monographie-pruef',
    template: 'monographie',
    options: { title_page: false },
    comments: 'footnote',
    marks: 'show',
  },
  { name: 'essay', template: 'essay', options: { author: 'A. Autor' } },
  {
    name: 'essay-titel',
    template: 'essay',
    options: { author: 'A. Autor', title_page: true, contents: true },
  },
  {
    name: 'essay-ueberschriften',
    template: 'essay',
    options: {},
    sets: {
      heading_1: {
        align: 'center',
        line_above: true,
        line_above_distance: '0.5em',
        line_below: true,
        line_below_color: '#b00020',
        line_below_thickness: '2pt',
        line_below_width: '3cm',
        line_below_distance: '0.3em',
      },
      heading_2: { align: 'right', line_below: true, line_below_width: '50%' },
    },
  },
  {
    name: 'essay-versalien',
    template: 'essay',
    options: {},
    sets: {
      heading_1: { text_case: 'upper', align: 'center' },
      heading_2: { text_case: 'smallcaps' },
    },
  },
  {
    name: 'essay-zitat-im-text',
    template: 'essay',
    options: {},
    sets: { quote_inline: { italic: true, color: '#b00020' } },
  },
  {
    name: 'essay-a5',
    template: 'essay',
    options: {},
    sets: { page: { paper: 'a5' }, body: { size: '9pt' } },
  },
  {
    name: 'essay-b5',
    template: 'essay',
    options: {},
    sets: { page: { paper: 'b5' } },
  },
  {
    name: 'essay-fussnoten-klammern',
    template: 'essay',
    options: {},
    sets: {
      footnote: {
        marker_style: 'brackets',
        entry_number: 'period',
        number_color: 'accent',
        separator_style: 'dashed',
        separator_color: '#7a1f2b',
      },
    },
  },
  {
    name: 'essay-fussnoten-symbole',
    template: 'essay',
    options: {},
    sets: {
      footnote: { note_numbering: 'symbols', marker_style: 'super_paren', separator_style: 'none' },
    },
  },
  {
    name: 'randnotizen-fussnoten-klammern',
    template: 'randnotizen',
    options: {},
    sets: { footnote: { marker_style: 'parens', entry_number: 'period', number_color: '#b00020' } },
  },
  {
    name: 'essay-doppelt-fussnoten-einfach',
    template: 'essay',
    options: { line_height: '2' },
    sets: {
      footnote: { line_height: '1' },
      quote: { line_height: '1' },
      bibliography: { line_height: '1' },
      figure_caption: { line_height: '1' },
      table: { line_height: '1' },
      heading: { line_height: '1' },
    },
  },
  {
    name: 'bericht-formeln',
    template: 'bericht',
    options: {},
    sets: {
      equation: {
        color: 'accent',
        number_color: '#b00020',
        above: '2em',
        below: '2em',
        math_font: 'libertinus',
      },
    },
  },
  {
    name: 'essay-quer',
    template: 'essay',
    options: {},
    sets: { page: { orientation: 'landscape' } },
  },
  {
    name: 'essay-eigen',
    template: 'essay',
    options: {},
    sets: { page: { paper: 'custom', page_width: '12cm', page_height: '19cm' } },
  },
  {
    name: 'essay-ohne-trennung',
    template: 'essay',
    options: {},
    hyphenate: false,
  },
  {
    name: 'essay-verweise',
    template: 'essay',
    options: {},
    sets: {
      link: { color: '#1a56b0', fill: '#e8f0fe', italic: true, weight: 'bold' },
      references: { color: '#b00020', fill: '#fff2a8', italic: true, weight: 'semibold' },
    },
  },
  {
    name: 'essay-randnoten',
    template: 'essay',
    options: {},
    sets: { footnote: { placement: 'margin' } },
  },
  {
    name: 'monographie-randnoten',
    template: 'monographie',
    options: { author: 'A. Autor' },
    sets: { footnote: { placement: 'margin', margin_width: '5cm', size: '0.8em' } },
  },
  {
    name: 'monographie-randnoten-unten',
    template: 'monographie',
    options: { author: 'A. Autor' },
    sets: { footnote: { placement: 'bottom', margin_width: '5cm', size: '0.8em' } },
  },
  {
    name: 'essay-randnoten-spalten',
    template: 'essay',
    options: {},
    sets: { footnote: { placement: 'margin' }, page: { columns: '2' } },
  },
  {
    name: 'essay-nummern',
    template: 'essay',
    options: { contents: true },
    sets: {
      heading: { number_depth: '3' },
      heading_1: { number_format: 'roman' },
      heading_2: { number_format: 'alpha' },
      heading_3: { number_format: 'roman_lower' },
    },
  },
  {
    name: 'essay-schriften',
    template: 'essay',
    options: { author: 'A. Autor', title_page: true, contents: true },
    sets: {
      heading: { letter_spacing: '0.08em', font: 'DejaVu Sans Mono' },
      quote: { font: 'DejaVu Sans Mono', size: '0.8em' },
      epigraph: { font: 'Libertinus Serif', weight: 'bold' },
      figure_caption: { font: 'DejaVu Sans Mono', italic: true },
      table: { font: 'DejaVu Sans Mono', size: '0.8em' },
      footnote: { font: 'DejaVu Sans Mono', italic: true },
      contents: { font: 'DejaVu Sans Mono' },
      bibliography: { font: 'DejaVu Sans Mono' },
      title_page_title: { letter_spacing: '0.2em' },
    },
  },
  {
    name: 'essay-spalten',
    template: 'essay',
    options: { author: 'A. Autor', contents: true },
    sets: { page: { columns: '2', column_gap: '0.8cm' }, figure: { span_columns: true } },
  },
  {
    name: 'essay-tabellen',
    template: 'essay',
    options: {},
    sets: {
      table: {
        border_style: 'booktabs',
        header_bold: true,
        header_fill: '#e6e6e6',
        stripe_fill: '#f4f4f4',
        cell_align: 'center',
      },
      quote: {
        border_left: true,
        border_color: '#b00020',
        border_thickness: '3pt',
        border_gap: '1em',
        fill: '#f2f2f2',
        padding: '0.6em',
      },
    },
  },
  {
    name: 'essay-literatureinzug',
    template: 'essay',
    options: {},
    bib:
      BIB +
      '@book{lang2021, author = {Lang, Lena}, title = {Eine Studie mit einem sehr langen Titel, der ganz sicher mehr als eine einzige Zeile der Seite füllt und dann noch ein Stück weitergeht}, year = {2021}, publisher = {Verlag}}\n',
    extraSheets: { 'zusatz/zusatz.typ': '= Zusatz\n\nSiehe @lang2021.\n' },
    sets: { bibliography: { hanging_indent: '4em' } },
  },
  {
    // Two margin notes on one line, the second with citations: the notes must settle (the gap
    // between them is in em in Randnotizen, which the margin notes once could not work with).
    name: 'randnotizen-belege-am-rand',
    template: 'randnotizen',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        'Eine Fußnote.#footnote[Kurz.] Und noch eine.#footnote[Mit Belegen, etwa @smith2020 und @jones2019.]',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'essay-bildunterschrift',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(image("assets/bild.png", width: 40%), caption: [Eine lange Bildunterschrift, die breiter wäre als das Bild und deshalb in mehrere Zeilen umbricht])',
        '',
      ].join('\n'),
    },
    sets: {
      figure_caption: {
        caption_gap: '2em',
        caption_fit: true,
        label_font: 'New Computer Modern',
        label_weight: 'bold',
        label_style: 'normal',
        label_color: '#b00020',
      },
    },
  },
  {
    name: 'essay-bildunterschrift-rahmen',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(image("assets/bild.png", width: 40%), caption: [Eine lange Bildunterschrift, die breiter wäre als das Bild und deshalb in mehrere Zeilen umbricht])',
        '',
      ].join('\n'),
    },
    sets: {
      figure: { align: 'right', frame_width: '1pt', frame_distance: '10pt' },
      figure_caption: { caption_fit: true },
    },
  },
  {
    name: 'zeitschrift-bildunterschrift',
    template: 'zeitschrift',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(image("assets/bild.png", width: 40%), caption: [Eine lange Bildunterschrift, die breiter wäre als das Bild und deshalb in mehrere Zeilen umbricht])',
        '',
      ].join('\n'),
    },
    sets: { figure_caption: { caption_fit: true } },
  },
  {
    name: 'essay-tabellenunterschrift',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(table(columns: 3, [A], [B], [C], [1], [2], [3]), caption: [Eine lange Überschrift der Tabelle, die breiter wäre als die Tabelle selbst und umbricht])',
        '',
      ].join('\n'),
    },
    sets: {
      table_caption: {
        caption_gap: '2em',
        caption_fit: true,
        label_weight: 'bold',
        label_style: 'normal',
        label_color: '#0b6e4f',
      },
    },
  },
  {
    name: 'essay-bildlinks',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(image("assets/bild.png", width: 30%), caption: [Am Rand])',
        '',
        '#image("assets/bild.png", width: 20%)',
        '',
        'Im Text #box(image("assets/bild.png", height: 1em)) mitten darin.',
        '',
      ].join('\n'),
    },
    sets: { figure: { align: 'right' } },
  },
  {
    name: 'essay-bildrahmen',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '#figure(image("assets/bild.png", width: 100%), caption: [Ganz breit])',
        '',
        '#image("assets/bild.png", width: 30%)',
        '',
        'Im Text #box(image("assets/bild.png", height: 1em)) ohne Rahmen.',
        '',
      ].join('\n'),
    },
    sets: {
      figure: {
        frame_width: '1.5pt',
        frame_color: '#b00020',
        frame_radius: '8pt',
        frame_distance: '6pt',
      },
    },
  },
  {
    name: 'essay-listeneinzug',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        'Davor.',
        '',
        '- Punkt',
        '  - Unterpunkt',
        '    - Tiefer',
        '- Noch ein Punkt',
        '',
        'Danach.',
        '',
      ].join('\n'),
    },
    sets: { list: { list_indent: '4em', level_indent: '0.5em' } },
  },
  {
    name: 'essay-listenzeichen',
    template: 'essay',
    options: {},
    sets: {
      list: {
        color: '#333355',
        above: '1.6em',
        below: '2.4em',
        marker_font: 'New Computer Modern',
        marker_weight: 'bold',
        marker_color: '#b00020',
      },
    },
  },
  {
    name: 'essay-zitatlinien',
    template: 'essay',
    options: {},
    sets: {
      quote: {
        border_top: true,
        border_bottom: true,
        border_right: true,
        border_color: '#0b6e4f',
        border_thickness: '0.8pt',
        border_gap: '0.7em',
        padding: '0.2em',
      },
    },
  },
  {
    name: 'essay-nummerntext',
    template: 'essay',
    options: { contents: true },
    sets: {
      heading: {
        number_separator: 'dash',
        number_suffix: '.',
        number_gap: '1em',
        number_style: 'hanging',
      },
      heading_1: { number_prefix: 'Kapitel ' },
      contents: {
        show_depth: '2',
        leader: 'none',
        chapter_weight: 'bold',
        title_text: 'Inhalt',
      },
    },
  },
  {
    name: 'monographie-kopfzeile',
    template: 'monographie',
    options: { author: 'A. Autor', contents: true },
    sets: {
      header: {
        slot_left: 'title',
        slot_right: 'chapter_number',
        mirror: true,
        divider: true,
        divider_thickness: '0.4pt',
        size: '0.85em',
        italic: true,
        skip_chapter_start: false,
      },
      footer: { slot_center: 'none', slot_right: 'page', mirror: true },
      page_number: { page_style: 'dashes', front_format: 'roman' },
    },
  },
  {
    name: 'essay-fusszeile',
    template: 'essay',
    options: {},
    sets: {
      header: {
        slot_center: 'section',
        slot_right: 'author',
        text_case: 'smallcaps',
      },
      footer: { slot_left: 'title', slot_center: 'none', slot_right: 'page', divider: true },
      page_number: { page_style: 'prefix', number_format: 'roman_lower' },
    },
  },
  {
    name: 'monographie-kopfzeile-standard',
    template: 'monographie',
    options: { author: 'A. Autor' },
    sets: { header: { slot_left: 'title', slot_right: 'chapter_number' } },
  },
  {
    name: 'monographie-rechts',
    template: 'monographie',
    options: { title_page: false, contents: false },
    sets: { heading_1: { break_before: 'odd' } },
  },
  {
    name: 'monographie-einzelseiten',
    template: 'monographie',
    options: { title_page: false, contents: false },
    sets: {
      page: { facing: 'single', margin_inside: '4cm', margin_outside: '2cm' },
      heading_1: { break_before: 'odd' },
      header: {
        slot_left: 'title',
        slot_right: 'chapter_number',
        mirror: true,
        skip_chapter_start: false,
      },
    },
  },
  {
    name: 'monographie-doppelseiten',
    template: 'monographie',
    options: { title_page: false, contents: false },
    sets: {
      page: { facing: 'facing', margin_inside: '4cm', margin_outside: '2cm' },
      heading_1: { break_before: 'odd' },
      header: {
        slot_left: 'title',
        slot_right: 'chapter_number',
        mirror: true,
        skip_chapter_start: false,
      },
    },
  },
  {
    name: 'essay-randnoten-einzelseiten',
    template: 'essay',
    options: {},
    sets: { footnote: { placement: 'margin' }, page: { facing: 'single' } },
  },
  {
    name: 'essay-literatur',
    template: 'essay',
    options: {},
    sets: {
      bibliography: { title_text: 'Quellen', hanging_indent: '1.5em', entry_spacing: '1.2em' },
    },
  },
  {
    name: 'essay-beschriftung',
    template: 'essay',
    options: {},
    sets: {
      figure_caption: { caption_position: 'above', caption_separator: 'period', align: 'left' },
      table_caption: { caption_position: 'above', caption_separator: 'dash' },
      references: {
        supplement_figure: 'Abb.',
        supplement_table: 'Tab.',
        supplement_equation: 'Gl.',
      },
    },
  },
  {
    name: 'essay-tabellenabstand',
    template: 'essay',
    options: {},
    // A table has its own space before and after it; without, it keeps the figure's.
    sets: { table: { above: '2.5em', below: '3em' } },
  },
  {
    name: 'essay-listen',
    template: 'essay',
    options: {},
    extraSheets: {
      'zusatz/zusatz.typ': [
        '= Zusatz',
        '',
        '+ Erster Schritt',
        '+ Zweiter Schritt mit einem Fuß#footnote[Eine erste Fußnote.] und#footnote[Eine zweite, längere Fußnote, die über mehr als eine Zeile gehen soll, damit der Einzug sichtbar wird.] noch einer.',
        '',
        '- Punkt',
        '  - Unterpunkt',
        '- Noch ein Punkt',
        '',
        '```',
        'let x = 1',
        'print(x)',
        '```',
        '',
        '$ a^2 + b^2 = c^2 $',
        '',
      ].join('\n'),
    },
    sets: {
      list: {
        marker: 'dash',
        enum_format: 'letter_paren',
        marker_gap: '1em',
        item_spacing: '1em',
        list_indent: '1em',
        level_indent: '1em',
      },
      footnote: { note_gap: '1em', note_indent: '2em' },
      equation: { number_side: 'left', size: '1.2em' },
      code: { fill: '#eeeeee', padding: '0.6em', radius: '4pt' },
    },
  },
  {
    name: 'essay-farben',
    template: 'essay',
    options: {},
    sets: {
      palette: { accent: '#b00020', accent_secondary: '#2a6f3a' },
      heading_1: { color: 'accent' },
      heading_2: { color: 'accent_secondary' },
      link: { color: 'accent', underline: true },
      references: { color: 'accent', underline: true },
      highlight: { fill: '#ffd0d0' },
    },
  },
  {
    name: 'manuskript',
    template: 'manuskript',
    options: { author: 'A. Autor', subtitle: 'Eine Untersuchung' },
    comments: 'footnote',
    marks: 'show',
  },
  {
    name: 'monographie-kapitel',
    template: 'monographie',
    options: { author: 'A. Autor', subtitle: 'Eine Untersuchung' },
  },
  {
    name: 'zeitschrift',
    template: 'zeitschrift',
    options: { author: 'A. Autor' },
  },
  {
    name: 'randnotizen',
    template: 'randnotizen',
    options: { author: 'A. Autor' },
  },
  {
    name: 'bericht',
    template: 'bericht',
    options: {
      author: 'A. Autor',
      subtitle: 'Eine Untersuchung',
      list_of_figures: true,
      list_of_tables: true,
    },
  },
  {
    name: 'essay-klein',
    template: 'essay',
    options: { author: 'A. Autor' },
  },
]

let dir: string | null = null
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

/** The SVG of each page of each variant exported in this run, for tests that look inside a page. */
const svgPages = new Map<string, string[]>()

async function exportPages(variant: (typeof VARIANTS)[number]): Promise<string[]> {
  dir = await mkdtemp(join(tmpdir(), 'wm-golden-'))
  const root = join(dir, 'Arbeit')
  await mkdir(root, { recursive: true })
  const fs = createRootedFs(root, () => Promise.resolve())
  const created = await ProjectSession.create(fs, 'Meine Arbeit', 'de')
  if (!created.ok) throw new Error('no project')
  // The title page fields are the project's, not an option of the export.
  const author = variant.options['author']
  const titelei = await created.value.setTitelei({
    authors:
      variant.titelei?.authors ??
      (typeof author === 'string' && author !== '' ? [{ name: author, affiliation: '' }] : []),
    subtitle: typeof variant.options['subtitle'] === 'string' ? variant.options['subtitle'] : '',
    date: variant.titelei?.date ?? '',
    version: variant.titelei?.version ?? '',
  })
  if (!titelei.ok) throw new Error('no title page fields')
  await writeFile(join(root, 'library.bib'), variant.bib ?? BIB)
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'assets', 'bild.png'), PNG)
  for (const [path, text] of Object.entries({ ...SHEETS, ...variant.extraSheets })) {
    await mkdir(join(root, 'content', dirname(path)), { recursive: true })
    await writeFile(join(root, 'content', path), text)
  }
  for (const [slot, text] of Object.entries(variant.titelei?.parts ?? {})) {
    await mkdir(join(root, 'titelei'), { recursive: true })
    await writeFile(join(root, 'titelei', `${slot}.typ`), text)
  }
  const opened = await ProjectSession.open(fs)
  if (!opened.ok) throw new Error('not opened')
  const { templates, prelude } = await loadTemplates(TEMPLATES)
  const bundled = templates.find((t) => t.info.id === variant.template)!
  const template = variant.sets
    ? {
        ...bundled,
        files: bundled.files.map((f) =>
          f.path === 'style.toml'
            ? { ...f, content: setsToToml(mergeSets(parseSets(f.content), variant.sets!)) }
            : f,
        ),
      }
    : bundled
  const profile: ExportProfile = {
    ...defaultProfile('apa-7'),
    template: variant.template,
    comments: variant.comments ?? 'remove',
    marks: variant.marks ?? 'hide',
    ...(variant.hyphenate !== undefined ? { hyphenate: variant.hyphenate } : {}),
    ...(variant.binding !== undefined ? { binding: variant.binding } : {}),
    options: resolveOptions(template.info, variant.options),
  }
  const built = await opened.value.prepareExport(profile, template, prelude, { write: true })
  if (!built.ok) throw new Error('not prepared')
  execFileSync(
    binary,
    [
      'compile',
      '--root',
      root,
      '--ignore-system-fonts',
      // The fonts the app brings for the templates (Libertinus Math).
      '--font-path',
      join(TEMPLATES, 'fonts'),
      '--format',
      'svg',
      MAIN_FILE,
      '_build/golden-{0p}.svg',
    ],
    // The title page prints the date: pin it, or the pages would move every day.
    { cwd: root, stdio: 'pipe', env: { ...process.env, SOURCE_DATE_EPOCH: '1767225600' } },
  )
  const files = (await readdir(join(root, '_build')))
    .filter((f) => /^golden-\d+\.svg$/.test(f))
    .sort()
  const dump = process.env['GOLDEN_DUMP']
  if (dump) {
    await mkdir(join(dump, variant.name), { recursive: true })
    for (const file of files)
      await copyFile(join(root, '_build', file), join(dump, variant.name, file))
  }
  svgPages.set(
    variant.name,
    await Promise.all(files.map((file) => readFile(join(root, '_build', file), 'utf8'))),
  )
  const hashes: string[] = []
  for (const file of files)
    hashes.push(
      createHash('sha256')
        .update(await readFile(join(root, '_build', file)))
        .digest('hex')
        .slice(0, 16),
    )
  return hashes
}

describe.skipIf(!installed)('the compiler', () => {
  it(`is Typst ${TYPST_VERSION}, which the golden pages were made with`, () => {
    expect(version, `${binary} (set EZETTA_TYPST to another)`).toContain(` ${TYPST_VERSION}`)
  })
})

describe.skipIf(!installed || !pinned)('the pages of the bundled templates', () => {
  for (const variant of VARIANTS) {
    it(`${variant.name} is set as it was`, async () => {
      const pages = await exportPages(variant)
      const file = join(GOLDEN, `${variant.name}.json`)
      if (update || !existsSync(file)) {
        await mkdir(GOLDEN, { recursive: true })
        await writeFile(
          file,
          `${JSON.stringify({ pages: pages.length, hashes: pages }, null, 2)}\n`,
        )
        return
      }
      const expected = JSON.parse(await readFile(file, 'utf8')) as {
        pages: number
        hashes: string[]
      }
      expect(pages.length, 'the number of pages').toBe(expected.pages)
      const moved = pages.flatMap((hash, i) => (hash === expected.hashes[i] ? [] : [i + 1]))
      expect(moved, 'pages that are set differently').toEqual([])
    })
  }
})

/**
 * Where the text of a page reaches: the last glyph of each line, the median over the lines (so a
 * note in the margin does not count). Typst places groups with `translate(x y)` and lines of text
 * with `matrix(1 0 0 -1 x y)`, each glyph a `<use x="…">` inside.
 */
const rightEdge = (svg: string): number => {
  const ends = new Map<number, number>()
  const stack: [number, number][] = []
  let x = 0
  let y = 0
  for (const [tag] of svg.split('<defs>')[0]!.matchAll(/<g\b[^>]*>|<\/g>|<use\b[^>]*>/g)) {
    if (tag === '</g>') {
      const [dx, dy] = stack.pop()!
      x -= dx
      y -= dy
    } else if (tag.startsWith('<g')) {
      const move = /translate\((\S+) (\S+)\)|matrix\((?:\S+ ){4}(\S+) (\S+)\)/.exec(tag)
      const dx = move ? Number(move[1] ?? move[3]) : 0
      const dy = move ? Number(move[2] ?? move[4]) : 0
      if (tag.endsWith('/>')) continue
      stack.push([dx, dy])
      x += dx
      y += dy
    } else {
      const line = Math.round(y)
      const at = x + Number(/ x="([^"]+)"/.exec(tag)?.[1] ?? 0)
      ends.set(line, Math.max(ends.get(line) ?? at, at))
    }
  }
  const sorted = [...ends.values()].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

describe.skipIf(!installed || !pinned)('the margin notes and the front matter', () => {
  it('leave the title page and the contents as they are with notes at the foot of the page', async () => {
    const read = async (name: string): Promise<string[]> =>
      (JSON.parse(await readFile(join(GOLDEN, `${name}.json`), 'utf8')) as { hashes: string[] })
        .hashes
    const margin = await read('monographie-randnoten')
    const foot = await read('monographie-randnoten-unten')
    // Page 1 is the title page, page 2 the contents (its numbers differ: the text is longer), page 3 the text.
    expect(margin[0]).toBe(foot[0])
    expect(margin[2]).not.toBe(foot[2])
  })

  it('give the contents the full width of the page, as without notes in the margin', async () => {
    const margin = await exportPages(VARIANTS.find((v) => v.name === 'monographie-randnoten')!)
    const foot = await exportPages(VARIANTS.find((v) => v.name === 'monographie-randnoten-unten')!)
    expect(margin.length).toBeGreaterThan(foot.length)
    const contentsOf = (name: string) => svgPages.get(name)![1]!
    const wide = rightEdge(contentsOf('monographie-randnoten-unten'))
    const mine = rightEdge(contentsOf('monographie-randnoten'))
    expect(Math.abs(wide - mine)).toBeLessThan(3)
    // The text on page 3 stops where the notes' column begins, well short of that.
    const text = rightEdge(svgPages.get('monographie-randnoten')![2]!)
    expect(text).toBeLessThan(wide - 100)
  })
})
