= Writing <sec-writing>

While writing, the text stays what it is: paragraphs with headings. Styling is limited to what is needed, and the tools are in the bar at the top. You can _emphasize_, make things *strong* and set #smallcaps[small caps], H#sub[2]O or E = mc#super[2]. Links show as text with a target, for example to #link("https://typst.app")[the Typst website].

The Enter key starts a new paragraph. A new line in the same paragraph, as in an address or a poem, comes with Shift and Enter, \
like here.

A slash at the start of a line opens a menu of everything a paragraph can be and everything that can be inserted: headings, lists, quotes, footnotes, images, tables, formulas and more. Further letters narrow it down, "/tab" to the table, for instance. It also has the divider, which sets two parts of a text apart, as here:

#divider()

How the divider prints, as three asterisks, as a rule or as space only, is decided by the template.

== Headings and lists <sec-lists>

Headings structure the text and appear in the outline and in the contents of the export. How they are numbered is decided by the template. Lists come with bullets and with numbers:

- An item of the list.
- A second item, which may be longer and run over several lines if it needs to.
  - One level deeper.

+ The first step.
+ The second step.

== Highlights and comments <sec-highlights>

Two aids never reach the finished document unless you want them to. A ::highlight:: marks text you want to think about later. A comment is a note to yourself, here right behind this sentence./* This comment does not print. It stands as a small mark in the text and can be clicked. */ In the export you decide whether highlights are visible and whether comments appear as footnotes, for a copy to be reviewed, for instance.

You see the text in Typst notation when you switch on "Source" at the bottom in the status bar: then the editor shows the plain text everywhere, for example `_emphasize_` for emphasis and `*strong*` for strong.
