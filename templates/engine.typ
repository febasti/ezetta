// The engine shared by all templates. It holds no visual values: the app resolves the
// template's style.toml into `style.typ` on every export (one dictionary per element, every property
// already inherited), and this file only applies it. `project(meta, body)` is called by the
// generated main file with what the export dialog gathered: the title, the language, and the
// options of template.toml.

#import "style.typ": style, heading-numbering, page-numbering
#import "marginalia.typ"

// The properties of an element that are text properties, as arguments for `set text(..)`. What an
// element leaves unset is left out, so the compiler's own value stays.
#let text-args(c, italic: true) = {
  let args = (:)
  if c.at("font", default: none) != none { args.insert("font", c.font) }
  if c.at("size", default: none) != none { args.insert("size", c.size) }
  if c.at("weight", default: none) != none { args.insert("weight", c.weight) }
  if italic and c.at("italic", default: none) != none {
    args.insert("style", if c.italic { "italic" } else { "normal" })
  }
  if c.at("color", default: none) != none { args.insert("fill", c.color) }
  if c.at("letter_spacing", default: none) != none { args.insert("tracking", c.letter_spacing) }
  args
}

// A line spacing as a factor of single spacing, which is 1.2 times the size of the type (the
// usual setting, close to a word processor's "single"): 1.5 puts the baselines 1.8 times the size
// apart. The line box is made exactly 1em high (the default is the font's cap height, which differs
// from font to font), so the distance is 1em plus the leading in every font. `none` leaves the text
// as it is (an element that follows the document).
#let spaced(factor, body) = if factor == none { body } else {
  set text(top-edge: 0.8em, bottom-edge: -0.2em)
  set par(leading: (float(factor) * 1.2 - 1) * 1em)
  body
}

#let align-of(a) = if a == "center" { center } else if a == "right" { right } else { left }

#let project(meta, body) = {
  let bd = style.body
  let paper = if style.page.paper == "b5" { "iso-b5" } else { style.page.paper }
  // Facing pages (a book): the inside margin is at the spine, on a right-hand page at the left and on a
  // left-hand page at the right; chapters may start on a right-hand page; a header may be mirrored.
  // Single pages: every page is the same, the inside margin is the left one.
  let facing = style.page.facing == "facing"
  // The binding offset of the document: added to the inside margin, for what the binding takes.
  let inside = style.page.margin_inside + meta.at("binding", default: 0pt)
  let title-page = meta.at("title_page", default: true)
  let contents = meta.at("contents", default: true)
  let author = meta.at("author", default: "")

  set document(title: meta.title, author: if author != "" { author } else { () })
  set text(..text-args(bd), lang: meta.lang, hyphenate: bd.hyphenate)
  set par(
    justify: bd.justify,
    spacing: bd.paragraph_spacing,
    first-line-indent: if bd.first_line_indent == none { 0pt } else { bd.first_line_indent },
  )
  // The line spacing of the whole document: the template's option, which "Dokument einrichten" shows.
  show: spaced.with(meta.at("line_height", default: none))
  // The size: a named paper, upright or turned (landscape), or a custom width and height.
  let size = if style.page.paper == "custom" {
    (width: style.page.page_width, height: style.page.page_height)
  } else {
    (paper: paper, flipped: style.page.orientation == "landscape")
  }
  set page(
    ..size,
    margin: if facing {
      (
        top: style.page.margin_top,
        bottom: style.page.margin_bottom,
        inside: inside,
        outside: style.page.margin_outside,
      )
    } else {
      (
        top: style.page.margin_top,
        bottom: style.page.margin_bottom,
        left: inside,
        right: style.page.margin_outside,
      )
    },
  )
  // Footnotes in the margin (Tufte style): the notes stand beside the text in the outer margin, whose
  // width is the page's outside margin plus the notes' column. Only the text has it (below), not the
  // title page and the contents. Not with columns: the text would have no single edge to put them beside.
  let fn = style.footnote
  let notes-in-margin = fn.placement == "margin" and int(style.page.columns) == 1
  // The margin notes are given their lengths in absolute units, as the body text resolves them: the
  // package works out where each note goes from them, and a length in em would be read at another
  // size where it measures a note, so the notes would never settle (and a citation in one fails).
  let notes-layout(content) = if notes-in-margin {
    context {
      let abs(l) = if type(l) == length { l.to-absolute() } else { l }
      marginalia.setup(
        inner: (far: abs(inside), width: 0pt, sep: 0pt),
        outer: (far: abs(style.page.margin_outside), width: abs(fn.margin_width), sep: abs(fn.margin_gap)),
        top: abs(style.page.margin_top),
        bottom: abs(style.page.margin_bottom),
        book: facing,
        clearance: if fn.note_gap == none { 12pt } else { abs(fn.note_gap) },
        content,
      )
    }
  } else { content }
  // Lists: the marker, the numbering, the indent, and the spacing.
  let ls = style.list
  // Typst indents every level by the same amount: that is the indent per level, and the outermost
  // list is moved so that its first level stands at the indent of the list.
  let list-indent = if ls.list_indent == none { 0pt } else { ls.list_indent }
  let level-indent = if ls.level_indent == none { 0pt } else { ls.level_indent }
  let markers = if ls.marker == "bullet" { [•] } else if ls.marker == "dash" { [–] } else if ls.marker == "circle" { [◦] } else if ls.marker == "square" { [▪] } else { ([•], [‣], [–]) }
  let enum-patterns = (arabic_dot: "1.", arabic_paren: "1)", arabic_brackets: "(1)", letter_paren: "a)", letter_dot: "a.", letter_upper_dot: "A.", roman_dot: "i.")
  let marker-gap = if ls.marker_gap == none { 0.5em } else { ls.marker_gap }
  let item-gap = if ls.item_spacing == none { auto } else { ls.item_spacing }
  // The bullets and numbers may have a typeface, a weight and a colour of their own.
  let marker-args = (:)
  if ls.marker_font != none { marker-args.insert("font", ls.marker_font) }
  if ls.marker_weight != none { marker-args.insert("weight", ls.marker_weight) }
  if ls.marker_color != none { marker-args.insert("fill", ls.marker_color) }
  let marked(m) = if marker-args.len() == 0 { m } else { text(..marker-args, m) }
  let enum-pattern = enum-patterns.at(ls.enum_format)
  set list(indent: level-indent, marker: if type(markers) == array { markers.map(marked) } else { marked(markers) }, body-indent: marker-gap, spacing: item-gap)
  set enum(indent: level-indent, numbering: if marker-args.len() == 0 { enum-pattern } else { (..n) => marked(numbering(enum-pattern, ..n)) }, body-indent: marker-gap, spacing: item-gap)
  show list: set text(fill: ls.color) if ls.color != none
  show enum: set text(fill: ls.color) if ls.color != none
  // The space before and after a list and its indent, for the outermost list only: a list inside a
  // list is part of it. A side that is not set keeps the paragraph spacing.
  let list-depth = state("ezetta-list-depth", 0)
  let list-around(it) = if ls.above == none and ls.below == none and list-indent == level-indent { it } else {
    context if list-depth.get() > 0 { it } else {
      block(
        above: if ls.above != none { ls.above } else { par.spacing },
        below: if ls.below != none { ls.below } else { par.spacing },
        pad(left: list-indent - level-indent, { list-depth.update(1); it; list-depth.update(0) }),
      )
    }
  }
  show list: list-around
  show enum: list-around

  // Headings: numbered 1, 1.1, 1.1.1; a chapter may start on a new page.
  // Numbers by level (their format) down to a depth; deeper headings have none.
  let depth = heading-numbering.depth
  set heading(numbering: if depth == 0 { none } else {
    (..nums) => if nums.pos().len() > depth { none } else { numbering(heading-numbering.pattern, ..nums.pos()) }
  })
  show heading: it => {
    let level = calc.min(it.level, 4)
    let hs = style.at("heading_" + str(level))
    let kind = style.heading
    if hs.break_before != "none" and (it.level > 1 or meta.at("chapter_new_page", default: true)) {
      // "odd": the heading starts on a right-hand page, with a blank page before it where needed.
      pagebreak(weak: true, to: if hs.break_before == "odd" and facing { "odd" } else { none })
    }
    let c = kind + hs
    set text(..text-args(c))
    // A decorative line: as long as `width`, in the alignment of the heading, `distance` from the text.
    let rule(side) = line(
      length: c.at("line_" + side + "_width"),
      stroke: (paint: c.at("line_" + side + "_color"), thickness: c.at("line_" + side + "_thickness")),
    )
    block(above: hs.above, below: hs.below, sticky: kind.keep_with_next, width: 100%, spaced(kind.line_height, {
      set align(align-of(c.align))
      set par(spacing: 0pt)
      set block(spacing: 0pt)
      if c.line_above {
        rule("above")
        v(c.line_above_distance)
      }
      let title = if c.text_case == "upper" { upper(it.body) } else if c.text_case == "smallcaps" { smallcaps(it.body) } else { it.body }
      // The number: a text before it, a text after it, and a gap to the title.
      let prefix = if c.number_prefix == none { "" } else { c.number_prefix }
      let suffix = if c.number_suffix == none { "" } else { c.number_suffix }
      let numbered = it.numbering != none and it.level <= depth
      if numbered and c.number_style == "hanging" {
        // Lines after the first start under the title, not under the number.
        let num = [#prefix#counter(heading).display(it.numbering)#suffix]
        context par(hanging-indent: measure(num).width + c.number_gap)[#num#h(c.number_gap)#title]
      } else {
        [
          #if numbered {
            prefix
            counter(heading).display(it.numbering)
            suffix
            h(c.number_gap)
          }
          #title
        ]
      }
      if c.line_below {
        v(c.line_below_distance)
        rule("below")
      }
    }))
  }

  // Headers and footers: three places (left, centre, right), each with the page number, the title
  // of the chapter or section on the page, the title of the work, or the author.
  let hd = style.header
  let ft = style.footer
  let pn = style.page_number
  let page-label() = {
    let format = here().page-numbering()
    if format == none { return none }
    let n = counter(page).display(format)
    if pn.page_style == "dashes" { [– #n –] }
    else if pn.page_style == "prefix" { [#if meta.lang == "de" [Seite] else [Page] #n] }
    else { n }
  }
  // The last heading of a level that starts on this page or before it.
  let heading-before(level) = {
    let found = query(heading.where(level: level)).filter(h => h.location().page() <= here().page())
    if found.len() == 0 { none } else { found.last() }
  }
  let is-after(a, b) = {
    let (pa, pb) = (a.location().position(), b.location().position())
    pa.page > pb.page or (pa.page == pb.page and pa.y > pb.y)
  }
  let heading-label(h, with-number) = {
    if h == none { return none }
    let number = if with-number and h.numbering != none and h.level <= depth {
      numbering(h.numbering, ..counter(heading).at(h.location()))
    } else { none }
    if number == none { h.body } else { [#number #h.body] }
  }
  let slot(kind, c) = {
    if kind == "page" { page-label() }
    else if kind == "title" { meta.title }
    else if kind == "author" { meta.at("author", default: "") }
    else if kind == "chapter" { heading-label(heading-before(1), c.show_number) }
    else if kind == "section" {
      let (chapter, section) = (heading-before(1), heading-before(2))
      if section != none and (chapter == none or is-after(section, chapter)) { heading-label(section, c.show_number) } else { none }
    } else { none }
  }
  let bar(c, divider-side) = context {
    let on-chapter-page = query(heading.where(level: 1)).any(h => h.location().page() == here().page())
    if c.skip_chapter_start and on-chapter-page { return none }
    let (l, m, r) = (c.slot_left, c.slot_center, c.slot_right)
    if facing and c.mirror and calc.even(here().page()) { (l, r) = (r, l) }
    let cased(x) = if x == none { none }
      else if c.text_case == "upper" { upper(x) }
      else if c.text_case == "smallcaps" { smallcaps(x) }
      else { x }
    set text(..text-args(c))
    let row = grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 1em,
      align: (left, center, right),
      cased(slot(l, c)),
      cased(slot(m, c)),
      cased(slot(r, c)),
    )
    let rule = line(length: 100%, stroke: (paint: c.divider_color, thickness: c.divider_thickness))
    if not c.divider { row }
    else if divider-side == "below" { stack(dir: ttb, spacing: c.divider_gap, row, rule) }
    else { stack(dir: ttb, spacing: c.divider_gap, rule, row) }
  }
  let used(c) = c.divider or c.slot_left != "none" or c.slot_center != "none" or c.slot_right != "none"
  let header-bar = if used(hd) { bar(hd, "below") } else { none }
  let footer-bar = if used(ft) { bar(ft, "above") } else { none }
  set page(header-ascent: hd.distance, footer-descent: ft.distance)

  // Equations are numbered (1), (2), …; code and raw text use the code style.
  // Formulas: the math font, the size and colour, the space around one on lines of its own, and
  // the number with its side and colour. What is unset stays as Typst has it.
  let eq = style.equation
  let eq-number = if eq.number_color == none { "(1)" } else { (..n) => text(fill: eq.number_color, numbering("(1)", ..n)) }
  set math.equation(numbering: eq-number, number-align: if eq.number_side == "left" { start + horizon } else { end + horizon })
  show math.equation: set text(size: eq.size)
  show math.equation: set text(font: "Libertinus Math") if eq.math_font == "libertinus"
  show math.equation: set text(fill: eq.color) if eq.color != none
  show math.equation.where(block: true): set block(above: eq.above) if eq.above != none
  show math.equation.where(block: true): set block(below: eq.below) if eq.below != none
  let code = style.code
  show raw: set text(..text-args(code))
  // A code block can be a box with a background.
  show raw.where(block: true): it => {
    if code.fill != none or code.padding != 0pt { block(width: 100%, fill: code.fill, inset: code.padding, radius: code.radius, it) } else { it }
  }

  // Quotes, figures, tables, footnotes.
  // A quote in the text is set by Typst. A block quote is indented, in the quote size, in the
  // quotation marks of the language with `quotes: true` (the project setting), and its source (the
  // attribution) follows on a line of its own at the right. An epigraph is a block quote with the
  // label <epigraph>: set apart at the right, its source under it.
  show quote.where(block: false): set text(..text-args(style.quote_inline))
  show quote.where(block: true): it => {
    let source = if type(it.attribution) == label { cite(it.attribution) } else { it.attribution }
    if it.at("label", default: none) == <epigraph> {
      let e = style.epigraph
      let s = style.epigraph_source
      align(right, block(
        width: e.width,
        above: e.above,
        below: e.below,
        spaced(e.line_height, {
          set align(left)
          set par(justify: false)
          set text(..text-args(e, italic: false))
          text(style: if e.italic { "italic" } else { "normal" }, it.body)
          if source != none {
            align(right, block(above: s.above, {
              set text(..text-args(s))
              [— #source]
            }))
          }
        }),
      ))
    } else {
      let q = style.quote
      let content = spaced(q.line_height, {
        set text(..text-args(q))
        if it.quotes == true { quote(it.body) } else { it.body }
        if source != none { align(right, source) }
      })
      // Lines on any side, a background, and padding make the quote a box of its own. A side with a
      // line keeps its distance to the text, a side without one the padding.
      let side-line(on) = if on { (paint: q.border_color, thickness: q.border_thickness) } else { none }
      let side-inset(on) = if on { q.border_gap } else { q.padding }
      if q.border_top or q.border_bottom or q.border_left or q.border_right or q.fill != none or q.padding != 0pt {
        block(
          inset: (left: q.indent_left, right: q.indent_right),
          above: q.above,
          below: q.below,
          block(
            width: 100%,
            fill: q.fill,
            stroke: (
              top: side-line(q.border_top),
              bottom: side-line(q.border_bottom),
              left: side-line(q.border_left),
              right: side-line(q.border_right),
            ),
            inset: (
              top: side-inset(q.border_top),
              bottom: side-inset(q.border_bottom),
              left: side-inset(q.border_left),
              right: side-inset(q.border_right),
            ),
            content,
          ),
        )
      } else {
        block(
          inset: (left: q.indent_left, right: q.indent_right),
          above: q.above,
          below: q.below,
          content,
        )
      }
    }
  }
  // Captions: above or below, with a mark after the number, aligned as the template says.
  let caption-mark(c) = if c.caption_separator == "period" { [. ] } else if c.caption_separator == "dash" { [ – ] } else if c.caption_separator == "space" { [ ] } else { [: ] }
  let caption-side(c) = if c.caption_position == "above" { top } else { bottom }
  let (fc, tc) = (style.figure_caption, style.table_caption)
  show figure.where(kind: image): set figure.caption(position: caption-side(fc), separator: caption-mark(fc))
  show figure.where(kind: table): set figure.caption(position: caption-side(tc), separator: caption-mark(tc))
  show figure.where(kind: image): set figure(gap: fc.caption_gap) if fc.caption_gap != none
  show figure.where(kind: table): set figure(gap: tc.caption_gap) if tc.caption_gap != none
  // The label of a caption ("Abbildung 1:") may have a typeface, a weight, a style and a colour of its
  // own: the caption is then written again from its parts.
  let label-args(c) = text-args((
    font: c.label_font,
    weight: c.label_weight,
    italic: if c.label_style == "italic" { true } else if c.label_style == "normal" { false } else { none },
    color: c.label_color,
  ))
  let with-label(it, c) = if label-args(c).len() == 0 { it } else {
    text(..label-args(c), {
      if it.supplement != none { it.supplement; "\u{a0}" }
      context it.counter.display(it.numbering)
      it.separator
    })
    it.body
  }
  show figure.caption: it => {
    let c = if it.kind == table { tc } else { fc }
    set text(..text-args(c))
    let caption = if it.kind == image or it.kind == table { with-label(it, c) } else { it }
    spaced(c.line_height, if c.align != none { set align(align-of(c.align)); caption } else { caption })
  }
  // A caption may be limited to the width of what it belongs to. A width in percent is of the space there is.
  let fitted(c) = it => if not c.caption_fit { it } else {
    show figure.caption: cap => layout(area => block(width: measure(it.body, width: area.width).width, cap))
    it
  }
  show figure.where(kind: image): fitted(fc)
  show figure.where(kind: table): fitted(tc)
  // What a reference calls things where the template does not use the language's own words.
  let rf = style.references
  show figure.where(kind: image): set figure(supplement: if rf.supplement_figure == none { auto } else { rf.supplement_figure })
  show figure.where(kind: table): set figure(supplement: if rf.supplement_table == none { auto } else { rf.supplement_table })
  set math.equation(supplement: if rf.supplement_equation == none { auto } else { rf.supplement_equation })
  show figure: set block(above: style.figure.above, below: style.figure.below)
  // A picture, as a figure or on its own, stands where the template says, and its caption follows
  // unless it has an alignment of its own. It may have a border. An image in the line of the text (in
  // a box) or in a table has neither. A corner radius rounds the picture too when it touches the
  // border.
  let fg = style.figure
  let image-align = align-of(fg.align)
  show figure.where(kind: image): set align(image-align)
  let framed = fg.frame_width != none and fg.frame_width != 0pt
  let in-line = state("ezetta-in-line", false)
  let not-apart(it) = { in-line.update(true); it; in-line.update(false) }
  show box: not-apart
  show table: not-apart
  show image: it => context if in-line.get() { it } else {
    align(image-align, if not framed { it } else {
      layout(area => {
        // A width in percent is of the space there is: the picture is measured in that, and the
        // frame made to fit it, for inside the frame the percentage would be of the frame.
        let distance = if fg.frame_distance == none { 0pt } else { fg.frame_distance.to-absolute() }
        let inner = area.width - 2 * distance
        let picture = measure(it, width: inner)
        block(
          width: picture.width + 2 * distance,
          height: picture.height + 2 * distance,
          breakable: false,
          stroke: (paint: fg.frame_color, thickness: fg.frame_width),
          radius: if fg.frame_radius == none { 0pt } else { fg.frame_radius },
          clip: true,
          place(top + left, dx: distance, dy: distance, block(width: inner, { set align(left); it })),
        )
      })
    })
  }
  let tb = style.table
  show table: set text(..text-args(tb))
  show table: it => spaced(tb.line_height, it)
  // The rules of a table: between the rows (the usual), three (above, under the header, under the
  // last row), a grid, or none.
  let border = tb.border_style
  let rows-of(it) = {
    let n = 0
    for c in it.children {
      if c.func() == table.header or c.func() == table.footer { n += c.children.len() }
      else if c.func() == table.cell { n += 1 }
    }
    calc.ceil(n / it.columns.len())
  }
  let strokes(rows) = (x, y) => if border == "rows" {
    (top: if y == 0 { tb.rule_strong_width } else { none }, bottom: tb.rule_width)
  } else if border == "booktabs" {
    (
      top: if y == 0 { tb.rule_strong_width } else { none },
      bottom: if y == 0 { tb.rule_width } else if y == rows - 1 { tb.rule_strong_width } else { none },
    )
  } else if border == "grid" { tb.rule_width } else { none }
  set table(
    inset: tb.inset,
    stroke: strokes(0),
    align: if tb.cell_align == none { auto } else { align-of(tb.cell_align) },
  )
  // What depends on the table itself (whether it has a header, how many rows): such a table is made
  // again with that known. The new one is labelled, so this does not run on it a second time.
  let instance-styles = border == "booktabs" or tb.header_bold or tb.header_fill != none or tb.stripe_fill != none
  show table: it => {
    if not instance-styles or it.at("label", default: none) == <wm-table> { return it }
    let header = it.children.any(c => c.func() == table.header)
    let fields = it.fields()
    let children = fields.remove("children")
    let _ = fields.remove("stroke", default: none)
    let _ = fields.remove("fill", default: none)
    let fills = (x, y) => {
      let body = if header { y - 1 } else { y }
      if header and y == 0 and tb.header_fill != none { tb.header_fill }
      else if body >= 0 and tb.stripe_fill != none and calc.odd(body) { tb.stripe_fill }
      else { none }
    }
    show table.cell.where(y: 0): set text(weight: if header and tb.header_bold { "bold" } else { tb.weight })
    [#table(..fields, stroke: strokes(rows-of(it)), fill: fills, ..children) <wm-table>]
  }
  // The number of a footnote: its format, how the marker in the text is set, the number in the
  // note, and its colour. Typst's own marker and entry stay where nothing differs from them.
  let fn-format = (arabic: "1", roman_lower: "i", alpha_lower: "a", symbols: "*").at(fn.note_numbering)
  let fn-paint(body) = if fn.number_color == none { body } else { text(fill: fn.number_color, body) }
  let fn-marker(n) = fn-paint(
    if fn.marker_style == "super" { super(n) }
    else if fn.marker_style == "super_paren" { super[#n)] }
    else if fn.marker_style == "sub" { sub(n) }
    else if fn.marker_style == "brackets" { [\[#n\]] }
    else if fn.marker_style == "parens" { [(#n)] }
    else { n },
  )
  let fn-entry(n) = if fn.entry_number == "period" { fn-paint[#n.] }
    else if fn.entry_number == "plain" { fn-paint(n) }
    else { fn-marker(n) }
  let own-marker = fn.marker_style != "super" or fn.number_color != none
  let own-entry = own-marker or fn.entry_number != "same"
  // A number set as a superscript runs into the note's text, as Typst sets it; any other has a space.
  let runs-in = fn.entry_number == "same" and fn.marker_style in ("super", "super_paren")
  set footnote(numbering: fn-format)
  // The rule above the notes: its style, weight, length and colour; none with the notes in the margin.
  let fn-rule = if notes-in-margin or fn.separator_style == "none" { none } else {
    line(length: fn.rule_length, stroke: (
      paint: fn.separator_color,
      thickness: fn.rule_width,
      dash: if fn.separator_style == "solid" { none } else { fn.separator_style },
    ))
  }
  show footnote.entry: set text(..text-args(fn))
  show footnote.entry: it => spaced(fn.line_height, it)
  set footnote.entry(
    separator: fn-rule,
    gap: if fn.note_gap == none { 0.5em } else { fn.note_gap },
    indent: if fn.note_indent == none { 1em } else { fn.note_indent },
  )
  // Typst lays out an entry at the foot of the page for every footnote, even one a show rule
  // replaces; with the notes in the margin the entries are hidden and take no room.
  set footnote.entry(clearance: 0pt, gap: 0pt) if notes-in-margin
  show footnote.entry: it => if notes-in-margin { none } else if own-entry {
    let loc = it.note.location()
    h(it.indent)
    link(loc, fn-entry(numbering(fn-format, ..counter(footnote).at(loc))))
    if not runs-in [ ]
    it.note.body
  } else { it }
  show footnote: it => if notes-in-margin {
    if own-entry {
      marginalia.note(
        // A space after a number that is not a superscript; the margin note would drop a plain one.
        numbering: (..i) => [#fn-entry(numbering(fn-format, ..i))#if not runs-in { h(0.3em) }],
        anchor-numbering: (..i) => fn-marker(numbering(fn-format, ..i)),
        text-style: text-args(fn),
        it.body,
      )
    } else {
      marginalia.note(numbering: (..i) => super(numbering(fn-format, ..i)), text-style: text-args(fn), it.body)
    }
  } else if own-marker {
    // The marker links to its note, as Typst's own does.
    context {
      let n = numbering(fn-format, ..counter(footnote).at(it.location()))
      let entry = query(footnote.entry).find(e => e.note.location() == it.location())
      link(if entry != none { entry.location() } else { it.location() }, fn-marker(n))
    }
  } else { it }
  show outline: set text(..text-args(style.contents))
  let bib = style.bibliography
  show bibliography: set text(..text-args(bib))
  show bibliography: it => spaced(bib.line_height, it)
  // The entries: an indent from the second line, and the space between them. Typst sets the entries
  // of a citation style that hangs as blocks of its own, indented by a fixed 1.5em and with the first
  // line pulled back as far (the paragraph's hanging indent does not reach them): those are set again
  // with the indent of the style. Numbered styles and those that do not hang keep their own layout.
  show bibliography: it => {
    let (hanging, gap) = (bib.hanging_indent, bib.entry_spacing)
    let other-indent = hanging != none and hanging != 1.5em
    show block: b => if other-indent and b.has("inset") and repr(b.inset).contains("1.5em") {
      pad(left: hanging, { h(1.5em - hanging); b.body })
    } else { b }
    set par(spacing: gap) if gap != none
    it
  }
  // A review PDF can show highlights: this is what they look like.
  show highlight: set highlight(fill: style.highlight.fill)
  // A link to a place in the text (a cross-reference to a heading) is set as the references are,
  // a link to the web as the links are.
  show link: it => {
    let l = if type(it.dest) == label { style.references } else { style.link }
    set text(..text-args(l))
    let shown = if l.at("fill", default: none) != none { highlight(fill: l.fill, it) } else { it }
    if l.at("underline", default: false) { underline(shown) } else { shown }
  }
  // A citation (the text the citation style makes of `@key`) has its own look.
  show cite: it => {
    let c = style.citations
    set text(..text-args(c))
    let shown = if c.fill != none { highlight(fill: c.fill, it) } else { it }
    if c.underline { underline(shown) } else { shown }
  }
  // A reference to a figure, a table or a formula is set as the references are; a citation is not.
  show ref: it => {
    if it.element == none { return it }
    let r = style.references
    set text(..text-args(r))
    let shown = if r.fill != none { highlight(fill: r.fill, it) } else { it }
    if r.underline { underline(shown) } else { shown }
  }

  // Title page, contents, lists: the front matter has roman page numbers, the text starts at 1.
  if title-page {
    set page(numbering: none, header: none, footer: none)
    set par(justify: false)
    let part(c, content) = align(align-of(c.align), text(..text-args(c), content))
    v(style.title_page.space_above)
    part(style.title_page_title, meta.title)
    if meta.at("subtitle", default: "") != "" {
      v(style.title_page_subtitle.above)
      part(style.title_page_subtitle, meta.at("subtitle"))
    }
    let authors = meta.at("authors", default: ())
    if authors.len() == 1 and authors.first().affiliation == "" {
      v(style.title_page_author.above)
      part(style.title_page_author, author)
    } else if authors.len() > 0 {
      // Several authors, or an affiliation: a line each, the affiliation below the name.
      v(style.title_page_author.above)
      part(style.title_page_author, for (i, a) in authors.enumerate() {
        if i > 0 { linebreak() }
        a.name
        if a.affiliation != "" {
          linebreak()
          text(size: 0.85em, a.affiliation)
        }
      })
    } else if author != "" {
      v(style.title_page_author.above)
      part(style.title_page_author, author)
    }
    v(style.title_page_date.above)
    part(style.title_page_date, meta.at("date_text", default: datetime.today().display("[day].[month].[year]")))
    if meta.at("version", default: "") != "" {
      part(style.title_page_date, [Version #meta.version])
    }
    // The next page counts from the page before it, so a header on the first text page shows 1.
    counter(page).update(0)
    pagebreak()
  }
  // The Titelei's texts (dedication, abstract, preface, acknowledgements) come after the title page,
  // before the contents, and are counted with the front matter.
  let parts = meta.at("parts", default: (:))
  let part-titles = if meta.lang == "de" {
    (abstract: "Abstract", preface: "Vorwort", acknowledgements: "Danksagung")
  } else {
    (abstract: "Abstract", preface: "Preface", acknowledgements: "Acknowledgements")
  }
  let lists = meta.at("list_of_figures", default: false) or meta.at("list_of_tables", default: false)
  let front = parts.len() > 0 or contents or lists
  if front {
    set page(numbering: page-numbering.front, header: none, footer: footer-bar)
    counter(page).update(1)
    let started = false
    for slot in ("dedication", "abstract", "preface", "acknowledgements") {
      if slot in parts {
        if started { pagebreak() }
        started = true
        if slot == "dedication" {
          set par(justify: false)
          align(center + horizon, emph(parts.dedication))
        } else {
          heading(level: 1, numbering: none, outlined: false, part-titles.at(slot))
          parts.at(slot)
        }
      }
    }
    if started and (contents or lists) { pagebreak() }
    if contents {
      let toc = style.contents
      let args = (indent: toc.indent)
      let shown = int(toc.show_depth)
      if shown < 6 { args.insert("depth", shown) }
      if toc.title_text != none { args.insert("title", toc.title_text) }
      // Chapters may be set in another weight than the rest of the entries.
      set outline.entry(fill: if toc.leader == "none" { none } else { repeat(gap: 0.15em)[.] })
      show outline.entry.where(level: 1): set text(weight: if toc.chapter_weight == none { toc.weight } else { toc.chapter_weight })
      outline(..args)
    }
    // A list of figures or of tables: its own text and title, and the leader of the contents unless it says another.
    let list-of(c, title, kind) = {
      set text(..text-args(c))
      set outline.entry(fill: if c.leader == "none" { none } else { repeat(gap: 0.15em)[.] })
      outline(title: if c.list_title != none { c.list_title } else { title }, target: figure.where(kind: kind))
    }
    if meta.at("list_of_figures", default: false) { list-of(style.list_of_figures, if meta.lang == "de" { "Abbildungsverzeichnis" } else { "List of figures" }, image) }
    if meta.at("list_of_tables", default: false) { list-of(style.list_of_tables, if meta.lang == "de" { "Tabellenverzeichnis" } else { "List of tables" }, table) }
    counter(page).update(0)
    pagebreak()
  }
  // The text is set in columns (the front matter above stays in one).
  let cols = int(style.page.columns)
  set columns(gutter: style.page.column_gap)
  // A figure may float across all the columns, at the top or the bottom of the page.
  if cols > 1 and style.figure.span_columns {
    set figure(placement: auto, scope: "parent")
    set page(numbering: page-numbering.body, columns: cols, header: header-bar, footer: footer-bar)
    counter(page).update(1)
    notes-layout(body)
  } else {
    set page(numbering: page-numbering.body, columns: cols, header: header-bar, footer: footer-bar)
    counter(page).update(1)
    notes-layout(body)
  }
}
