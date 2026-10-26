# Academic writing app: project specification

Status: draft v2.1, cleaned up to describe what will be built and what is planned for later stages. Items marked **[OPEN]** are undecided. Section 15 lists details to confirm early during implementation.

---

## 1. Purpose and goals

A clean, dense, cross-platform desktop app for writing long academic texts, in particular a doctoral thesis. It combines the focus of a writing tool (Ulysses, iA Writer) with the structure and academic depth of a long-document processor (Mellel) and the visual clarity of Anytype.

Target user: a doctoral student writing in German and English, mostly humanities or social sciences, who needs citations, footnotes, figures, equations, and a trustworthy way to organize a book-length text. The app is open source.

Goals:

- A project is a folder. Groups are subfolders and sheets are files. The folder structure only organizes the files and says nothing about the structure of the document. A 300-page thesis with hundreds of citations is comfortable to write.
- Citations, footnotes, figures, tables, equations, and cross-references render visually in the editor but remain plain Typst text in the file.
- Footnotes appear as margin notes in the editor. There is no pagination in the editor.
- Files are human-readable plain text. The writer is never locked in.
- The PDF is styled separately from the content, through templates, so the same text can look very different.
- Linux is a first-class platform alongside macOS and Windows.
- German and English UI from the first release.
- Competent spelling and grammar checking for German and English, at the level of LanguageTool, working offline.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Starting point | Built from scratch. |
| Shell | Electron, with a pinned current stable version. Main process, preload script, and renderer are separate bundles (section 6). |
| Frontend | Svelte 5, TypeScript, Vite. |
| Editor | CodeMirror 6 on plain Typst source. Rendered widgets are decorations over the source text. |
| Document format | Typst, written in a small subset (section 4). PDF is the output. |
| Project model | A project is a folder. Groups are subfolders, sheets are files. Order and metadata live in a small manifest. Folders only organize files and do not define the document structure. |
| Sidebar | Two columns as in Ulysses: groups (folders) and the sheets of the selected group. Either column can be hidden. An outline mode shows the real heading structure. |
| Logic | Business logic lives in a pure TypeScript core with no Electron, Node, or DOM dependencies, tested in Node. The main process is a thin adapter layer. |
| Styling | Own CSS design tokens. Headless primitives restyled to the design system. No pre-styled UI kit. |
| Chrome | No menu bar on Windows and Linux. On macOS the system's menu bar with every command of the app (Ablage, Bearbeiten, Format, Einfügen, Darstellung, Fenster, Hilfe). Everywhere a project menu in the sidebar header, a settings window, a command palette, and context menus. |
| Footnotes | Stored inline in the source. Shown as margin notes in the editor. |
| Comments | Stored in native Typst comment syntax. They never print by default. |
| Highlights | Stored as `::text::`. They print as plain text by default. |
| Export | The Typst compiler is bundled. Templates and export profiles control the look. |
| Languages | German and English UI from day one, through an i18n layer. |
| Platforms | macOS and Linux from the first release (a dmg, and an x64 AppImage). Windows later. Section 10. |
| Spelling and grammar | LanguageTool, bundled as a local server and used offline, for German and English. Chromium's built-in spell-check is turned off. Section 4.7. |

Open decisions:

| Topic | Notes |
|---|---|
| Packaging tool | electron-builder (decided 2026-10-17). Section 6.3. |
| License | GPL-3.0-or-later. Section 14. |
| App name | Ezetta. |
| **[OPEN]** Margin notes in print | Whether notes also appear as margin notes in the PDF. Section 7. |
| **[OPEN]** Right sidebar as library browser | Whether it also browses the whole library, or only lists works cited in the chosen scope. |
| **[OPEN]** Compile process | One-shot compiler calls for export, or a long-running process for incremental preview. Section 6.1. |
| **[OPEN]** Extended checking | Whether the optional n-gram data (several GB) is offered as a download. Section 4.7. |

---

## 3. The product

### 3.1 Window layout

```
+----------------------------------------------------------------------------------+
| Toolbar (compact icon buttons, grouped)                                          |
+-----------+------------+-------------------------------+-----------+-------------+
| Gruppen   | Abschnitte | Writing column                | Margin    | Right       |
| (folders) | of the     | (serif, ~65-70                | footnote  | sidebar     |
|           | selected   | chars)                        | cards     | "Literatur" |
|           | group      |                               |           | "Prüfung"   |
+-----------+------------+-------------------------------+-----------+-------------+
| Status bar: words/goal | group words | paragraph style | cite style | saved      |
+----------------------------------------------------------------------------------+
```

Every column can be resized and hidden. The Gruppen and Abschnitte columns are switched in the toolbar, not in the sidebar. The margin column appears only when notes exist. The Gruppen and Abschnitte columns are described in 3.2.

### 3.2 Left sidebar

Two columns, as in Ulysses, plus an outline mode.

**Gruppen (groups).** At the top the project control, plain text (the project's name, which breaks into lines when it is long, and a chevron; a quiet ground on hover), which opens the project menu (new, open, rename, close, export, the project's settings: footnote numbering, bibliography, and the entry "Einstellungen …" for the app's own settings (3.8)). Below it a tree of the project's folders. Groups only organize files. They carry no numbers and say nothing about the structure of the document. Groups are created, renamed, deleted (to the system trash), reordered, and nested by drag and drop. A group row shows its name, the number of sheets, and a mark when it is excluded from the export.

**Abschnitte (sheets).** The sheets of the selected group and of all groups below it, as one list in export order (depth first). A small heading marks each subgroup, and clicking a heading selects that group. The top row of the Gruppen column is "Alle Abschnitte": selecting it lists every sheet. The project is renamed in the project menu. The sidebar is flat, like a source list: a tinted background, the two columns as full-height panes with hairline dividers, each with a bar on top whose only button is the + icon (new group, new sheet; the name is its tooltip and screen-reader label). In the Abschnitte pane each sheet is a small white card with a hairline on the tinted background; the chosen sheets are marked by a neutral ring, not by color, and a sheet that is missing on disk is a dashed card. A sheet card shows:

- its first few lines, as plain text, like Ulysses: a heading among them is drawn bold (one line), the text after it as up to two lines. A sheet has no title field and no visible file name; the first heading (or the first words) is how the app names a sheet in lists, in quick open, and in messages. An empty sheet reads "Leerer Abschnitt",
- under the text, a line with a status dot and the status's name (Entwurf grey, Überarbeitet amber, Final green), and its word count at the right. A sheet that is left out of the export is a scratchpad (Notizblatt): a dashed card with a note symbol where the status would be, and no status.

Drag and drop reorders sheets and moves them between groups (drop onto a group in the Gruppen column, or before another sheet in a different folder). Sheets are created and deleted (to the trash) here; they are not renamed, because the first lines are the name. Multiple selection supports moving and changing the status.

**One column.** Either column can be hidden, and each has a smallest width (groups 160 px, sheets 200 px, right sidebar 240 px) below which its header and rows would no longer fit; the sidebar is exactly as wide as its columns. Without the Gruppen column, the header of the sheet list shows the current group as a switcher (a dropdown with the group tree), so navigation stays possible. A quick-open command (Strg P) jumps to any sheet, searching its first lines.

**Gliederung (outline) mode.** A button at the top of the sidebar (beside + of the Gruppen column, or of the Abschnitte column when Gruppen is hidden; Cmd+3) changes the sidebar to an outline of the headings in the project, in export order; Gruppen or Abschnitte bring the columns back. Numbers are computed from the heading levels, and each row shows the sheet the heading is in. Clicking a row opens the sheet at that heading. Skipped heading levels are flagged. This is where the structure of the document is visible, because it comes from the headings in the text and not from the folders.

**Export order and exclusion.** The export walks the groups and sheets depth-first, in the order shown. A group or sheet can be left out of the export, for notes, drafts, and research material. A group that is left out is moved into the material, a section under "Alle Abschnitte" headed "Material" (the folder `material/` beside `content/`), where any number of folders stand side by side; the section does not exist until its first folder is made, and it is not counted with the project's sheets; an excluded sheet stays where it is and is a scratchpad, with no status. Excluded items are skipped when assembling and in the outline.

### 3.3 Toolbar

Compact, grouped, no outlines: a row of icon buttons (32 px) in rounded group cards. A tool shows its name beside the icon only where the icon alone is not obvious (Beleg, Querverweis, Fußnote); every tool has its name, with its shortcut, as tooltip and for screen readers. Items that open a menu show a small chevron after the icon. Hover shows a filled background. German names, with English in parentheses:

| Group | Items |
|---|---|
| Seitenleisten | Gruppen, Abschnitte (show or hide the two left columns) |
| Verlauf | Zurück (undo), Vor (redo) |
| Text | Überschrift (heading), Betont, Wichtig, Format ▾, Link, Liste ▾ (bulleted, numbered) |
| Zitieren und Verweisen | Zitat ▾ (inline, block), Beleg (citation), Querverweis (cross-reference), Fußnote (footnote) |
| Einfügen | Tabelle ▾ (table), Bild ▾ (figure, subfigures, inline image), Formel ▾ (equation) |
| Prüfen | Anmerkung (highlight), Kommentar (comment), Prüfen (proofreading, with the checker) |
| Ansicht | Seitenleiste (show or hide the right sidebar) |

The groups are rounded cards. The Seitenleisten and Verlauf groups sit at the left, Seitenleiste alone at the right, and the groups between them are centered on the toolbar. Quelltext (show source) is not in the toolbar, since it is rarely used: it is a toggle in the status bar. Toggles that apply at the caret (Betont, Wichtig, Liste, Zitat, Anmerkung) show as pressed. The width does not change the toolbar. The Überschrift button cycles: each click sets the next heading level, 1 to 4, and after level 4 a plain paragraph again (a list item or a quote starts at level 1). Its icon shows the level of the heading at the caret (`heading`, or Tabler's `h-1` to `h-4`) and the button is pressed in a heading. The other paragraph styles stay in the status bar's paragraph menu, the selection popover, and the context menu.

### 3.4 Everyday formatting

Emphasis, strong, headings, lists, quotes, and links are in the toolbar (3.3) and have keyboard shortcuts. There is no floating toolbar over a selection: it would only repeat the toolbar's few basic tools. Besides the toolbar:

- **Context menu** (right click in the text): the system's own menu. At the top, for a spelling or grammar issue under the click, its suggestions, "Zum Projektwörterbuch" and "Ignorieren" (only while the Prüfung tab is showing); then Rückgängig, Wiederholen, Ausschneiden, Kopieren, Einfügen, Alles auswählen (the system's own, done on the page), Betont, Wichtig, Hyperlink, "Absatz ▸" (the paragraph styles), "Einfügen ▸" (footnote, citation, cross-reference, images, table, formulas, comment), and Quelltext. The word under the click offers "Synonyme …" next, which opens the synonyms dialog (SPEC 4.8); the menu itself never waits for a lookup. A right click outside the selection puts the caret there first. A text field inside a widget (a table cell, a caption) gets Ausschneiden, Kopieren, Einfügen, and Alles auswählen only. The context menus of the sidebar rows are the system's own too. Dropdowns under a toolbar button stay the app's own menu.
- **Find and replace** (Strg or Cmd F; Strg or Cmd Shift R opens it with the replace row): a small bar at the top right of the writing column, for the open sheet. It searches the source text, ignoring case unless "Groß-/Kleinschreibung beachten" is on; further switches are "Nur ganze Wörter" and "Regulärer Ausdruck" (JavaScript syntax, `$1` and `$<name>` in the replacement). All matches are marked in the text and the current one is stronger; the counter shows "3 / 12". Enter or Cmd G goes to the next match, Shift Enter or Cmd Shift G to the previous one, and both wrap around. "Ersetzen" replaces the current match and moves on, "Alle ersetzen" replaces all in one undo step and says how many. A selected line of text becomes the query when the bar opens. Esc closes the bar and leaves the current match selected. A match inside a widget or hidden syntax shows that source while it is the current match (4.3). Searching across sheets is not part of v1.
- **Slash menu:** typing `/` at the start of a line opens a menu of block types.
- **Status bar:** shows the current paragraph style ("Absatz: Fließtext ▾") and the citation style ("Zitierstil: APA 7 ▾").
- Every action can have a keyboard shortcut. Most come with one; the writer can set, change or remove each in the settings (3.8).

The UI says "Betont" and "Wichtig" (semantic), not "Kursiv" and "Fett".

### 3.5 Writing column

- A serif text face for the writing surface and a sans face for all chrome.
- A scrolling document with no pagination. The text has the whole height of the window: there is no header above it. The sheet's status (a menu) and word count float in a small badge in the top right corner (in the continuous view the group's name and its number of sheets too). A sheet has no title, no path, and no file name here.
- Only the open sheet is mounted in an editor instance, which keeps long theses fast.
- **Continuous view.** Selecting a group, or several sheets with Cmd or Shift, shows them together as one continuous read-only document in sheet order, with a thin separator per sheet (its word count; the text shows its own headings). Clicking into the text opens that sheet for editing with the cursor at the same spot, and clicking a separator opens the sheet. Dragging selects text for copying. Selecting a single sheet opens it for editing. Editing across sheets in one document is a possible later stage (section 12).
- Footnote markers are superscript. The note text appears in the margin column next to its marker.

### 3.6 Right sidebar

The toolbar's "Seitenleiste" button shows or hides it, on the tab it showed last. It has three tabs: Literatur, Prüfung, and Statistik. The icons of the toolbar are Tabler's `list-numbers` (Liste), `quote` (Zitat), `tag` (Querverweis), `asterisk` (Fußnote), and `layout-sidebar-right` (Seitenleiste).

The tabs are one bar with a hairline under it (control height plus 12 px): three equal tabs, the chosen one in the primary text color with an accent line (not a filled chip), and the number of issues on the Prüfung tab as a small accent badge. The scope switch of Literatur is a segmented control (one track, the chosen scope as a segment in it).

**Literatur**

- Lists the works cited in the current scope as a list of references: each work in full (authors, year, title, and where and how it appeared, with a DOI or URL), in the manner of APA 7, with a hanging indent and the titles of books and journals in italics, alphabetical (author, year), with a small count per work (3×). The reference is for reading in the app; the PDF's list of works follows the citation style of the export. Works whose key is not in the bibliography come last, marked.
- In the group and project scopes, a dot marks works cited in the sheet being edited.
- A switch sets the scope: sheet, group (the selected one, with its subgroups), or the whole project. Sheets that are not exported do not count for group and project, unless that is what is being looked at.
- A work is not a button: its reference can be selected and copied, and nothing opens on a click (the places a work is cited at are not listed; changed on 2026-10-19).
- A section "Offen" lists the places that still need a citation and the citations marked for checking (SPEC 4.6); a click on one shows where they are (sheet, line, the text around it), and a click on a place opens the sheet there.
- A second tab, "Prüfung", lists the spelling and grammar issues of the sheet (section 4.7). Its top has the state of the checker (a green, amber, or red light and its words) with an icon button that checks the sheet again, the language of the check as a selector (when the language has variants), "Prüfen auf" with the four kinds of issue as checkboxes in two columns, and "Akribischer Modus", a switch for the strict level (LanguageTool's picky: more hints on style, wording and punctuation; a project setting, stored as `level`); then, under a hairline, a line with the position ("2 von 4") and the previous and next buttons. An entry is the kind, a short name, and the text around the issue with the covered words underlined (a cut end loses its partial word and gets an ellipsis). The open entry is one card with the explanation, the suggestions as accent-tinted buttons, and under a hairline the quiet actions (dictionaries, ignore, switch the rule off). Without issues the tab shows a check mark and "Keine Hinweise."
- A third tab, "Statistik": for the open sheet its words (following what is typed) with the goal as a bar, the reading time (200 words a minute), the words in footnotes, and the counts of footnotes, figures, tables, and citations (with the number of works); for the selected group its words and sheets; for the project its words against the project goal, the words and sheets by status (Entwurf, Überarbeitet, Final) as a bar, the same counts, and what is left out of the export. The project's figures count only what is in the export.

### 3.7 Status bar

Word count against the sheet goal with a progress bar, word count of the current group, the Quelltext toggle (show source, pressed while on), paragraph style, citation style, and save state.

### 3.8 Settings window

A dialog over the window (Cmd or Strg + comma, "Einstellungen …" in the project menu, and in the application menu on macOS), with a list of pages on the left. It holds what belongs to the person and the app, not to one project; the project menu keeps the project's own settings (footnote numbering, bibliography, export); what the check looks for is set in the Prüfung tab (3.6). Pages: **Allgemein** (language of the interface, theme, and what the next start does, in a two-way switch: open the welcome page (the default) or the project that was open last), **Darstellung** (the style of the writing surface: serif (Libertinus Serif), sans-serif (Libertinus Sans) or monospace (IBM Plex Mono), with text size, line spacing, paragraph spacing and text width as numbers; then typewriter scrolling (off by default); then footnotes in the margin or in the text, the footnote list below the text; showing the Typst source is a switch in the editor, not a setting; then the kind of quotation marks and the marks around block quotes, which are stored in the project file and say so), and **Tastenkürzel** (every command of the app, grouped by what it does, with its shortcut: the writer clicks a shortcut and presses the new combination; it must include Cmd or Strg, Backspace takes it off, Esc leaves it; a combination another command has is taken over only after the writer agrees, and the keys the system or the editor keep, such as quit, hide, the clipboard, select all, undo and redo, are refused; a search field narrows the list, and a button next to a changed shortcut, and "Alle zurücksetzen", bring the defaults back). A new shortcut works at once everywhere it is shown: the editor's keys, the toolbar's tooltips, the menus and the macOS menu bar. Changes apply at once; there is no Apply button. Later settings (the spelling server, dictionaries, autosave) get a page here instead of a menu entry. App-level values are kept in the browser storage of the renderer for now, as the theme always was.

### 3.9 Versions

The app keeps versions of the project by itself, so that an earlier text of a sheet can always be found and brought back. They are on by default, with no setup. A version is taken soon after the project opens, then every 10 minutes while something changed, when the project closes, and before a PDF export; the writer can also save one with a name ("Abgabe an Betreuer"). Nothing is taken while nothing changed.

The versions live in a hidden folder inside the project (`.ezetta/history.git`), which tracks the project folder; it is git underneath (`isomorphic-git`, nothing to install), but the writer never sees that, and a `.git` of their own in the project is not touched. Hidden files, `_build/`, and files larger than 25 MB are left out. The history travels with the project folder when it is copied or moved.

"Versionen und Sicherung …" in the project menu opens a dialog with two tabs. The first, Versionen: the versions, newest first, grouped by day, with the names the writer gave; a switch for the automatic versions (the choice is stored in `project.toml` as `[history] enabled = false`, and absent means on); and "Version speichern …". Choosing a version lists the files that are not the same now (changed since, or deleted since): the sheets by their first line, and any other file (the manifest, the bibliography, images) by its path. Choosing a text file shows it compared with the current one word by word (what a restore would remove, what would come back); an image or another file that is not text is shown by its size. "Diese Fassung wiederherstellen" brings that one file back; "Alle … Dateien zurückholen …" brings back all of them after a confirmation. A restore first saves the present state as a version when it differs from the last one, so it can be undone, and then writes the files atomically as bytes, so an open editor shows a sheet like any change from outside and an image is not touched. A deleted file is brought back the same way. A restore removes nothing, except when the writer ticks "Auch … Dateien entfernen, die es damals noch nicht gab" for the restore of everything: those files then go to the system trash.

The second tab, Sicherung, sets up a backup, which protects against losing the computer where versions, living in the project folder, cannot. It takes one step: "Sicherungsordner wählen …" (a drive, or a folder that Dropbox, iCloud Drive, OneDrive or Nextcloud syncs, which also gives an off-site copy without the app knowing any account). The first backup is made at once. A backup is a zip of the project folder (the version history included, `_build/` and `node_modules` left out) named with the title and the time, `Dissertation 2026-10-12 14.30.zip`, written under a hidden temporary name and renamed when complete. Automatically one is made at most once an hour while something changed (compared by file sizes and times), and when the project closes (given at most 8 seconds). "Jetzt sichern" makes one anyway. The newest 10 stay; beyond them one per day for two weeks, one per week for three months, and one per month for two years; the others go to the system trash, and only files that follow this project's naming are ever touched. The folder is stored in the app's settings for that project folder (not in `project.toml`: a path to a drive is the machine's, not the project's). The folder must not be inside the project. The status bar shows "Nicht gesichert" (warning colour) until a folder is set, then "Gesichert vor 5 Minuten", and "Sicherung nicht erreichbar" (danger colour) when the drive is not connected; it opens the tab. To get a backup back: "Als Projekt öffnen …" on a backup in the list unpacks it into a new folder (a dialog first says what will happen: the open project stays as it is and is found again under "Zuletzt geöffnet", and the backup has to be set up anew for the restored project; then a dialog asks where; a name that is taken gets a number, nothing is overwritten) and opens it, and a notice names the folder; the welcome screen has "Aus Sicherung wiederherstellen …" for the same with a backup file picked from anywhere, which is the way back on a new computer. The file is a plain zip, so unzipping it by hand works as well.

---

## 4. Elements and syntax

### 4.1 Element set

The editor understands these elements. The file always holds Typst source, and the editor derives the rendering from it.

| Element | In the editor |
|---|---|
| Emphasis (Betont), strong (Wichtig) | Styled text, delimiters hidden |
| Superscript, subscript, small caps (Hochgestellt, Tiefgestellt, Kapitälchen) | Styled text, the function wrapper hidden |
| Heading, lists, block quote, link | Styled text |
| Inline quote (Zitat im Text) | Text between the quotation marks of the project language, on a faint purple ground that includes the marks, so that a real quote can be told from marks typed by hand |
| Highlight (Anmerkung) | Marker background on the range |
| Comment (Kommentar) | Inline dashed pill |
| Inline formula, block formula | Rendered math |
| Inline image | Small image in the text flow |
| Figure (Bild) | Image block with caption and an id (its label). The caption is typed in place, like a table's; the width and replacing the image are small tools in the corner of the picture, shown only while the figure is chosen (a click on the picture); Backspace or Delete removes the chosen figure. A figure whose image is not chosen yet is an empty frame with a button to choose the file, a placeholder |
| Subfigures | Figure block with two or more images, sub-captions, and an overall caption |
| Table (Tabelle) | A drawn table with its number and caption; its cells are edited in place, and a toolbar above it changes rows, columns, alignment, and the header row. A table that uses merged cells, lines, or code stays source |
| Citation (Beleg) | Chip, for example "Smith 2020" |
| Footnote (Fußnote) | Superscript marker plus margin card |
| Cross-reference (Querverweis) | Chip with what the PDF prints ("Abbildung 3", "Tabelle 2", "Gleichung (4)", "Abschnitt 2.1"); a missing target is a dashed chip. Clicking opens a picker of the project's headings, figures, tables, and block formulas |

### 4.2 Typst syntax

Paths are relative to the project root, with images in `assets/`. The editor writes exactly this syntax. Anything else the author writes stays visible as raw source.

**Emphasis and strong**

```
_betont_   *wichtig*
```

**Superscript, subscript, small caps**

```
E = mc#super[2]   H#sub[2]O   #smallcaps[NASA]
```

**Heading**

```
= Titel <sec-intro>
== Unterkapitel
```

**Lists**

```
- Punkt
  - verschachtelt (consistent indentation)

+ erster
+ zweiter
```

**Quotations.** One element, `quote`, for three kinds of quotation.

```
Kant schreibt #quote[Sapere aude] @kant1781[S. 12] und meint damit Mut.

#quote(block: true, attribution: [@kant1781[S. 12]])[Zitierter Text, ein längerer Absatz.]

#quote(block: true, attribution: [Goethe, _Faust_])[Habe nun, ach! Philosophie …] <epigraph>
```

1. **In the text (Zitat im Text).** An inline quote; its citation follows it like any citation.
2. **Block quote (Blockzitat).** A longer passage that is still part of the text, set off as an indented paragraph. Its source is the quote's `attribution`: ordinary markup in brackets, in which citations are written as everywhere else (`@key[S. 12]`), so the source is never inside the quoted text. The editor draws the citations as chips at the end of the quote, a click opens the citation editor, and the Beleg tool in a block quote cites into its attribution. A block quote without a source offers "Quelle hinzufügen" while the caret is in it.
3. **Epigraph.** A block quote with the label `<epigraph>` behind it, for the start of a chapter: set apart, with its source under it. The source is free text (`attribution: [Goethe, _Faust_]`), edited in a field under the epigraph, not with the citation editor. The label keeps the file plain Typst; the template decides how it looks.

The Zitat menu changes between the three. Making a block quote of a quote in the text moves the citation right after it into the attribution, and the other way round. An epigraph with free-text source cannot become a quote in the text (that would lose the source); a text source that is only citations can.

All three are the same `quote` element, and Typst sets the quotation marks of the project language, so the file never holds any. The editor draws the marks as decoration only. Block quotes have no marks by default. The project setting `[quotes] block_marks` adds them (in the project menu: "Blockzitate mit Anführungszeichen"): the editor draws them, and the export emits `#set quote(quotes: true)`. The marks come from the project `language` unless the project chooses a kind (`[quotes] style`: `de` „…“ ‚…‘, `de-guillemets` »…« ›…‹, `ch` «…» ‹…›, `fr` « … » (narrow no-break spaces inside), `en` “…” ‘…’, `en-single` ‘…’ “…”, `sv` ”…” ’…’, `pl` „…” «…», `ja` 「…」『…』; the export then emits `#set smartquote(quotes: …)`, which Typst applies to quotes and to straight quotes in the text), for inline and block quotes alike, and an inline quote inside a block quote with marks gets the inner pair. An epigraph has no marks. From a word count that depends on the citation style (APA 40 words, MLA 50, Chicago 100) the editor offers to turn an inline quote into a block quote with one click; it never does so by itself. The marks of a quote (drawn, or a block quote's hidden wrapper) read as characters, so a press next to them can take them, but in two steps: Backspace or Delete next to a mark, from outside or inside, marks the quote (it is drawn on the selection's ground, marks and all), and the next press takes the quote off and keeps its text, a block quote's source moving behind the text; any other key or move of the caret lets the mark go, and undo brings a quote back. An empty quote goes with the first press, a block quote's source first. The quote tool takes a quote off too. In the editor a quote in the text and a block quote have the same faint ground, a block quote with its rule beside it. While the caret is in a quote, its marks (the innermost quote's), or a block quote's rule, are in the accent. Enter at the end of a block quote's text starts a paragraph inside it; Enter on that empty last line moves it out, behind the quote, as Enter in an empty list item ends the list.

So that the writer uses the element and does not set quotation marks of their own, the editor makes a quote of marks typed by hand: typing the closing mark of a clear pair on one line, `"Text"`, `„Text“`, `„Text”`, `“Text”`, `»Text«` or `«Text»`, replaces the opening mark and the text by `#quote[Text]` (an input rule, like `==text==` for comments). The closing mark must follow a word, the opening one a space or the start of the line with a word right behind it, and no other mark may lie between them, so an inch sign (`5"`) or a stray mark is left alone, as are code, math, raw text, comments, and text with brackets that do not match. With Quelltext on, what is typed stays as typed. Marks that are already in a sheet, or pasted, are not changed.

**Highlight (custom)**

```
Die Stichprobe war ::zielgerichtet:: breit.
```

**Comment (native Typst comment)**

```
/* Auswahlkriterien genauer erklären */
```

The author types `==text==`, and an input rule converts it to the comment form when the closing `==` is typed. The file never contains `==`. The editor treats `//` line comments as comments as well.

**Inline and block formula** (Typst math syntax)

```
Die Größe $x^2$ wächst.

$ E = m c^2 $ <eq-k4x9tm>
```

Spaces inside the dollar signs make a formula a display block. Clicking a formula opens its source for editing; the drawing in the text is the preview, so the editor has none. A block formula on lines of its own opens a field inside its widget, under the drawing (the drawing follows the typing, Escape or a click elsewhere closes it); an inline formula, or a block formula that shares its line with text, opens a small popover with the same field. A formula stays what it was made as: there is no switch between an inline and a block formula (the toolbar's "Formel im Text" and "Abgesetzte Formel" decide), and neither editor has a remove button: a formula is removed like any widget, with Backspace or Delete next to it (the first press chooses it, the second removes it). Numbering of equations comes from the template. A block formula has an id like a figure: `eq-` and six random letters and digits, made when the block formula is placed. An inline formula has none.

**Inline image**

```
Text #box(image("assets/icon.png", height: 1em)) Text
```

**Figure**

```
#figure(
  image("assets/a.png", width: 75%),
  caption: [Beschriftung],
) <fig-k4x9tm>
```

The label is the figure's id: `fig-` and six random letters and digits, made when the figure is placed. It has nothing to do with the image file, so choosing another image later changes only the path, and cross-references stay correct.

**Figure without an image yet** (a placeholder)

```
#figure(
  rect(width: 100%, height: 6cm),
  caption: [Beschriftung],
) <fig-k4x9tm>
```

A plain frame, valid Typst on its own: the PDF prints an empty frame, numbered like any figure, and the export dialog lists it as still open. The editor shows an empty frame with the button "Bild auswählen …". Choosing a file swaps the frame for `image("assets/…", width: 75%)` and leaves everything else as it is.

**Subfigures** (a function in the app's prelude, proposed API)

```
#subfigures(columns: 2, caption: [Gesamtbeschriftung],
  figure(image("assets/a.png"), caption: [Interviews]) <fig-proben-a>,
  figure(image("assets/b.png"), caption: [Dokumente]) <fig-proben-b>,
) <fig-proben>
```

The group is numbered as one figure ("Abbildung 3") and the parts as "(a)" and "(b)". A reference to a part renders "Abbildung 3a".

**Links**

```
#link("https://example.org")[Text]
https://example.org
```

Bare URLs link automatically.

**Table**

```
#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header[Gruppe][n][Anteil],
    [A], [12], [40 %],
    [B], [18], [60 %],
  ),
  caption: [Stichprobe nach Gruppe],
) <tbl-k4x9tm>
```

A table has an id in the same way: `tbl-` and six random letters and digits, made when the table is placed, or when a bare table gets a caption and so becomes a numbered one. A bare `#table(…)` has none.
**Citation**

```
@smith2020
@smith2020[S. 14]
#cite(<smith2020>, supplement: [S. 14])
#cite(<smith2020>, form: "prose")
```

**Footnote**

```
Text im Absatz.#footnote[Inline-Notiz mit @smith2020.]
```

**Cross-reference**

```
siehe @fig-stichprobe, @tbl-stichprobe, @eq-energie und @sec-methoden
```

A heading is a target too (`= Methoden <sec-methoden>`); the editor hides the label of a heading and writes it when the first reference is made. Things without a label are counted all the same. A reference is `@label`, or `#ref(<label>)` where text right after it would join the label. A heading can only be referred to if the export template numbers headings.

**Labels.** Labels use a hyphen and not a colon, so they stay compatible with Pandoc-based tools later. Reserved prefixes are `fig-`, `tbl-`, `eq-`, and `sec-`. Figures, tables, and block formulas get a random id as their label when they are placed (`fig-k4x9tm`); labels that exist already, and the labels of headings (`sec-` and the heading's text), stay as they are. Bibliography keys must not use them. The bibliography itself is declared by the assembled file, never in a sheet.

### 4.3 Widget pattern and behavior contract

Pattern for every widget:

1. The widget only displays. It is a replace decoration with an atomic range.
2. Editing happens in a popover, dialog, or side panel that writes back to the source as a normal CodeMirror transaction. No editable content lives inside a widget. **One exception: a table**, whose cells are text fields inside the widget (see DECISIONS, 2026-10-08); each change is still a normal transaction of the sheet, and only the text of the cell changes.
3. The caret cannot enter a widget (atomic range), so its syntax cannot be broken by accident. Backspace or Delete next to it first selects it, drawn highlighted, and a second press deletes it whole. The widget's source shows only with the global "show source" toggle (rule 4). Lighter markup such as highlights still reveals its source where the caret touches it, both marks at once. A link's syntax stays hidden like the wrapper of subscript or small caps: Backspace at the start of its words takes the link off, and the address is changed with the Hyperlink tool.
4. A global "show source" toggle shows raw text everywhere.
5. Where parsing is ambiguous, the editor shows raw source. Text the app does not understand is never hidden.

Every widget defines and tests: arrow-key movement across it, backspace and delete at its edges, selection extension, copy and paste (copies the underlying source), undo and redo, search (matches source text), and a screen-reader label.

### 4.4 Footnotes

**Storage.** Footnotes stay inline at the marker, as `#footnote[…]`. An inline note travels with its text when a paragraph is moved. An optional label (`<fn-id>`) allows referring to a note again.

**Where notes are shown and written** (one setting, three choices; exactly one is active, in the settings window's Editor page):

- **Margin notes** (the default): a superscript marker in the text and a card in the margin level with it. The card is where the note is written: a click on the marker or on the card turns the card into a small editor in place.
- **Footnote list**: no margin; all notes of the sheet are in a list below the text, in order, and the open one is written in its row.
- **Floating cards**: no margin and no list; a click on the marker opens the note in a card that floats over the text at the marker.

The small editor is the same in all three: a CodeMirror editor on the note's inner range with the same extensions as the main one (citation chips render inside it), whose changes are dispatched into the parent document, so undo and redo stay unified. Only one note is open at a time; clicking another marker or card takes over, and Escape or a click elsewhere closes it (the caret after the marker). "Source" is the editor-wide "Quelltext" switch, not a mode. In the margin mode a window too narrow for the margin column (below about 440 px of text) shows the list instead, on its own; this is not a fourth choice.

**Editing.** When the cursor enters the marker with the keyboard, the source is revealed. A caret at either edge of a marker is outside it, so typing next to a note does not reveal it.

**The list** is also the place for the narrow-window fallback: it lists all notes of the open sheet in order and writes the open one in place.

**Rules for hidden source ranges** (they apply to every widget but matter most for notes, which are long):

- The extent of a note comes from the parser, never from regular expressions. Notes can contain nested brackets, code, and citations.
- A search match inside a hidden range reveals it.
- Word counts include note text according to a project setting (default: counted separately from body text).
- The margin card carries the text for screen readers, and the marker has an accessible label.
- Spelling and grammar checking covers note text, because the checker works on the parsed text and not on the page (section 4.7).

**Numbering.** The editor numbers notes in project order. The offset for a sheet is the number of notes in earlier sheets. The restart rule (continuous, or restarting at each level-1 heading) is a project setting and matches the export. Notes inside comments are not counted.

**Edge cases.** Notes inside headings, table cells, and figure captions are supported. The editor shows them below the block. Test them with fixtures.

**Source formatting.** The insert command writes long notes over several lines, to keep the source readable and diffs small.

**Margin layout.** v1 is a column to the right of the text with one card per note. When a sheet has notes the text column narrows and moves left to make room (down to about 440 px); with less room than that, the notes panel is used instead. Cards are positioned from the marker's coordinates (`view.coordsAtPos`) and recalculated inside CodeMirror's measure cycle. A collision pass pushes overlapping cards down. Clicking a card reveals the source.

### 4.5 Highlights and comments

**Highlight (Anmerkung).** A range mark stored as `::text::`. It prints as plain text by default.

- A highlight opens with `::` followed by a non-space character and closes with `::` preceded by a non-space character. It is not parsed inside code, raw blocks, math, or strings.
- A highlight that crosses paragraphs or other elements is stored as several spans that the editor treats as one. **[OPEN]** whether v1 supports this or restricts highlights to single paragraphs.
- The export profile decides whether highlights are hidden (default) or shown.

**Comment (Kommentar).** An inline note that never prints by default.

- Stored as a Typst comment, so it cannot appear in any output by accident.
- The editor shows it as an inline dashed pill with a comment icon. Long comments collapse to a short pill and expand on click or when the cursor enters.
- A comment placed immediately after a highlight (whitespace only between them) belongs to it.
- Comments are excluded from word counts and goals.
- Resolving a comment means deleting it. Undo and git history cover mistakes.
- The export profile decides what happens to comments: removed (default), shown as margin notes, or shown as footnotes (for a review PDF).
- The final export dialog warns "n offene Kommentare" when comments remain, so one cannot end up in a submitted thesis by accident.

Highlights are not Typst syntax, so every export runs through the app's preprocessing step (section 7). It skips code and math, handles spans crossing lines, and survives a citation or footnote inside a comment. It needs a thorough test suite.

### 4.6 Citations and works cited

- A chip is a working view, not a preview of the export. The app formats it from the BibTeX data in a short, readable form: "Smith 2020", "Smith und Jones 2019", "Smith et al. 2020", with the page reference after a comma ("Smith 2020, S. 14"); "und" or "and" and "o. J." or "n.d." follow the language of the text. The export formats citations with Typst and the project's CSL style, which may put them in footnotes or number them, so chips do not follow the style. A work that is not in the bibliography shows its key, marked.
- Possible later addition: chips formatted with any CSL style, including footnote and numeric styles (these need the full ordered citation list, not one chip at a time).
- A chip has five forms (for a group, one form for all its works): author and year, prose ("Smith (2020)"), year only, author only (`#cite(…, form: "prose" | "year" | "author")`), and not printed (`form: none`, which keeps the work in the bibliography without printing it in the text; the chip is dashed). The prose and the author form are part of the sentence, so they are drawn as text with a strong underline instead of a pill. Prefix and suffix are not part of Typst's `cite`, so they are not offered.
- Several works are cited by writing the citations next to each other (`@smith2020 @jones2019`, or `#cite(…) #cite(…)`, or a mix): Typst prints citations that are only separated by white space (a space or one line break) as one group, "(Jones, 2019; Smith, 2020)", in the order the style gives. A group has one form: with different forms in it Typst prints something broken ("Jones, 2019; Smith (2020)", or an empty place for a `none`). So the editor treats a group as a unit and shows it as one chip ("Smith 2020; Jones 2019, S. 4"), which opens one popover with a row for each work; the form chosen there is set for all of them, works added to a citation take its form, and a citation typed next to a group takes the group's form (the special form the others share) once the caret has moved on. Page reference and check mark stay per work. One editor (the Beleg button, or a click on a chip) serves both for choosing and for editing: a field holds the works as chips, with the search after them; choosing a work adds it, and the first one inserts the citation into the text; clicking a chip selects it, which shows its page reference and check mark (a flag) and lets the next choice replace it. The form is a dropdown in front of the field; chosen before the first work, the new citation is written in it.
- Two markers for the writer are Typst block comments, so the file stays valid Typst and the export never shows them (the profile may show comments as margin notes, SPEC 4.5). The `#` right after the comment's opening keeps them from being typed by accident: `@smith2020[S. 14]/*#check: Seitenzahl prüfen*/` (right behind a citation, no space, the note optional) marks it for checking later (a small flag on the chip), and `/*#cite-needed*/` marks a place that still needs a citation (a yellow chip "Beleg fehlt", no note). The citation editor has a fixed first row for the missing citation, and the check mark is set on a selected work; a marker opens the same editor, and works chosen there replace it.
- `@` triggers autocomplete from the bibliography (by key, author, year, or title). The citation editor offers the same search with a fixed first row for a place that still needs a citation, warns when entries of the bibliography file could not be read (works may be missing from the results), and opens below the line of the caret (or of the citation), centered horizontally on the editor, as the cross-reference picker does. The file itself is chosen in the project menu only.
- The right sidebar (3.6) is computed from the parsed citations of the chosen scope.

### 4.7 Spelling and grammar

**Engine.** LanguageTool, a rule-based checker for German and English, runs as a local server that the app starts and stops. Nothing is sent over the network. The main process talks to it through its HTTP interface (`/v2/check`), and the renderer asks through the IPC contract (section 6.6). Chromium's built-in spell-check is turned off, so there is one consistent system on every platform.

**What is checked.** The app builds the checker's input from the parsed Typst source:

- Prose is sent as text. Typst markup is sent as markup, which the checker ignores.
- Elements that stand for words get a short stand-in, so the surrounding grammar stays correct: a citation stands for its rendered form, a cross-reference for its resolved label, a footnote marker for nothing, and an inline formula for a neutral token.
- Footnote text is checked as separate paragraphs, so it never mixes with the surrounding sentence.
- Comments, code, and raw blocks are not checked.
- Results are mapped back to positions in the source.

**Language.** Taken from the project's `language` plus a variant (for example de-DE, de-AT, en-GB), set under `[proofing]` in the manifest. A sheet can override it. Passages marked with another language are skipped in v1.

**When.** Only while the "Prüfung" tab is showing (a deliberate choice): then, after a short pause in typing, for changed paragraphs only. Results are cached per paragraph, language, and settings. "Jetzt prüfen" checks the whole sheet again. The app works normally while the checker starts (a few seconds) or when it is unavailable, and the status bar shows its state.

**Presentation**

- Underlines in the text, colored by category (spelling, grammar, style, typography), built on CodeMirror's lint extension and styled with the design tokens.
- A tooltip on hover with the explanation and replacement suggestions that apply with one click. In the "Prüfung" tab, an entry opens in the list with the same explanation and suggestions, and the text only shows the place (scrolled to, with a background) without being selected.
- The "Prüfung" tab in the right sidebar lists the issues of the open sheet, with next and previous navigation. Only the open sheet is ever checked (a deliberate choice; there is no project-wide check).
- Issues inside footnotes appear in the "Prüfung" tab, as a badge on the margin card, and as underlines in the note's popover editor.

**Control**

- "Ignorieren" for one occurrence, "Regel deaktivieren", and "Zum Wörterbuch hinzufügen".
- Two dictionaries: a personal one for the writer and a project one (`dictionary.txt` in the project, versioned with it) for terms specific to the thesis. The app drops matches for words in either dictionary after each check.
- Settings: categories on or off, level (default or picky), disabled rules (stored in the manifest), and the server (built-in, or a user-provided URL). With a user-provided URL the text is sent to that server, and the settings screen says so.
- Optional "Erweiterte Prüfung": downloadable n-gram data for detecting confused words. It is several GB (roughly 3 GB for German and 15 GB for English), so it is an explicit opt-in.

**Packaging.** The server needs a Java runtime. The app bundles a trimmed runtime and only the German and English language modules, built per platform. It starts the server in the background at launch, bound to localhost only.

**Development.** During development the app starts the standalone LanguageTool package from `.dev/languagetool/` (not in git; `npm run fetch:dev-data` downloads it) with the Java on the machine, or from the folder named in `EZETTA_LANGUAGETOOL` (and `EZETTA_JAVA`). Packaging comes later.

### 4.8 Synonyms

**What it does.** A right click on a word (or on a selected word) offers "Synonyme …", which opens a dialog with the synonyms of the word, **in the form the sentence needs**. The dialog does the lookup, so the context menu opens at once; the first lookup of a session starts the helper (a few seconds, while the dialog says "Synonyme werden geladen …"). The dialog has a search field, filled with the word: any other word typed there is looked up in the same place of the sentence, so its synonyms take the form the sentence needs too. The thesaurus knows base forms only, so the word is first reduced to its base form together with its grammar (case, number, gender, tense, person), each synonym is looked up and inflected like the word was, and the dialog lists the forms that can be put in its place: "Ergebnisse" gives "Resultate", "Erfolge", not "Resultat"; "begründete" gives "rechtfertigte", "erklärte". A click replaces the word in the text (a capital at the start of a sentence stays) and closes the dialog. Each sense is a row of words; with several readings of a word ("begründet" as a verb and as an adjective) each is a group with its base form and kind of word as a heading. A synonym's usage note is shown after it ("ugs.", "fachspr."). A German noun of another gender than the word's own is marked with its article ("der"), because the article in the text may then need changing. Phrases are offered only for a word in its base form, since a phrase cannot be inflected; broader, narrower, related, and opposite terms are left out.

**Data.** The thesaurus files of LibreOffice in the MyThes format, read locally (nothing is sent anywhere): OpenThesaurus for German (LGPL 2.1 or CC BY-SA, snapshot 2017, credit openthesaurus.de) and WordNet-based for English (WordNet licence). Both licences are shipped with the files.

**Morphology.** LanguageTool's own taggers and synthesizers (German and English) do the base form and the inflection, through a small Java helper (`tools/morph/Morph.java`) that runs with the same Java and the same language modules as the checker, one JSON line in and out, started when the first synonyms are asked for. Where the helper is not available (no Java, no LanguageTool), only words in their base form get synonyms.

**Not yet.** Synonyms for other languages, and the newest OpenThesaurus data.

---

## 5. Project and file model

### 5.1 Layout on disk

```
Dissertation/
  project.toml
  library.bib
  dictionary.txt
  content/
    einleitung/
      einleitung.typ
    methoden/
      design.typ
      daten/
        interviews.typ
        dokumente.typ
      auswertung.typ
    notizen/
      ideen.typ
  assets/
    stichprobe.png
  templates/                      (optional, project-specific templates)
  _build/                         (generated, git-ignored, never edited by hand)
    main.typ
```

The `content/` folder holds the groups (folders) and sheets (`.typ` files). Groups have human-readable names without numbering. A sheet's file name is generated when the sheet is created (`s-` and six letters or digits, like `s-k4x9tm.typ`) and never changes: the app shows a sheet by its first lines and never by its file name (a project written before this keeps its file names, and they are not shown either). The folder structure only organizes the files. It does not define the structure of the document, which comes from the headings in the text. The order of groups and sheets lives in the manifest.

### 5.2 Manifest (`project.toml`)

TOML is human-readable and diffs well in git.

```toml
[project]
version = 1
title = "Dissertation"
language = "de"              # hyphenation, quotation marks, CSL locale
bibliography = "library.bib"   # relative to the project, or an absolute path to a file outside it
citation_style = "apa-7"     # CSL style id

[goals]
words = 80000

[quotes]
block_marks = false          # quotation marks around block quotes
style = "auto"               # kind of marks: auto (from `language`), de, de-guillemets, ch, fr, en, en-single, sv, pl, ja

[proofing]
language = "de-DE"           # variant used for checking; defaults from the project language
level = "default"            # default | picky
disabled_rules = []
dictionary = "dictionary.txt"   # project words that are never flagged

# The order of the items in each folder (groups and sheets, interleaved).
# The empty key stands for the content/ folder itself.
[order]
"" = ["einleitung", "methoden", "notizen"]
"methoden" = ["design.typ", "daten", "auswertung.typ"]
"methoden/daten" = ["interviews.typ", "dokumente.typ"]

# Settings per item, keyed by path inside content/.
# Only items that differ from the defaults are listed.
[items."methoden/design.typ"]
status = "revised"           # draft | revised | final (default: draft)
goal = 1200                  # word goal for the sheet

[items."notizen"]
export = false               # default: true
icon = "flask"               # folders only: a symbol for the sidebar (default: the plain folder)
color = "blue"               # folders only: the colour of that symbol (default: the plain grey)
```

The file is written deterministically (stable key order, one entry per line), so merges in git stay clean. Export profiles are stored here too (section 7).

### 5.3 Reconciling manifest and disk

On project load and on file-watcher events:

- A file or folder on disk but missing from the order list of its folder is appended at the end of that folder.
- An order entry whose file or folder is missing is kept and marked with a warning, with the actions "Entfernen" and "Neu verknüpfen". It is never dropped silently.
- Reconciliation never deletes or overwrites user files.
- Renames and moves done inside the app update disk, order lists, and item settings together.
- Renames done outside the app appear as a missing file plus a new file. The app suggests "looks like a rename" based on matching content.

**Export order.** Assembling walks the order lists depth-first and skips items marked `export = false` (with everything inside them).

### 5.4 Bibliography

The bibliography is a BibTeX or BibLaTeX `.bib` file, read by both the editor and Typst. The recommended Zotero workflow is an auto-exported Better BibTeX `.bib` file. The file is chosen in the project menu ("Bibliographie-Datei wählen …"). A file outside the project folder is not copied: the manifest holds its absolute path, the app watches it where it is and reloads it on change, and the export copies it into `_build/` for the compiler, which may only read inside the project.

### 5.5 Word counting

Count the words that would print. Exclude comments, markup, code, and the bibliography. Citations count as their rendered text. The rule is encoded in tests so it stays stable.

---

## 6. Architecture

### 6.1 Process model and layers

The app is an Electron application. One TypeScript code base builds three bundles and a shared core:

- **Main process** (`src/main`): app lifecycle, windows, the services that touch the system (files, folder watching, the Typst and LanguageTool child processes, settings), and the IPC handlers. It is a thin adapter layer. It implements the ports that `core` defines and contains no business rules.
- **Preload script** (`src/preload`): the only bridge between the renderer and the main process. It exposes one small, typed, versioned API object through `contextBridge` and nothing else.
- **Renderer** (`src/renderer`): the Svelte 5 app with the CodeMirror editor. It has no access to Node or Electron APIs and reaches the system only through the preload API.
- **Core** (`src/core`): the domain logic as pure TypeScript: manifest handling, reconciliation, ordering, word counts, the Typst grammar and semantic index, preprocessing, assembling, text extraction and offset mapping for proofreading, result caching, and editing commands. It imports nothing from Electron, Node built-ins, or the DOM. It defines ports (interfaces) for what it needs from outside: file system, compiler, checker, and clock.
- **Shared** (`src/shared`): the IPC contract, meaning channel names, request and response types, and the runtime schemas that validate them.

**Dependency rule.** `core` imports nothing from the other layers. `main` and `renderer` may import `core` and `shared` but never each other. `preload` imports only `shared`. CI enforces the rule with an import-boundary check (for example dependency-cruiser). As a result the core is tested in Node with in-memory fakes of its ports, without starting Electron.

**Child processes.** The main process starts the Typst compiler and the LanguageTool server with `spawn` (no shell), fixed arguments, and supervision: a health check, a restart policy, and a stop on quit. Export uses one-shot compiler calls. Live preview and the later graphical template editor need faster repeated compiles, through a long-running process **[OPEN]**. Preview pages are shown either as SVG or PNG pages exported by Typst, or as the PDF through pdf.js **[OPEN]**.

### 6.2 Repository layout

```
/src
  /core                  pure TypeScript domain logic + tests
    /project             manifest, reconciliation, ordering
    /typst               grammar, semantic index, commands, preprocessing, assembling
    /proofing            text extraction, offset mapping, caching, dictionary filter
    /export              profiles and templates
    ports.ts             interfaces implemented by the main process
  /main                  Electron main process
    /services            files, watcher, typst, languagetool, settings
    /ipc                 handler registration and validation
    index.ts
  /preload               the contextBridge API
  /renderer              Svelte app
    /editor              CodeMirror extensions
    /features            sidebar, toolbar, proofing panel, ...
    /ui                  components, tokens.css, gallery
    /i18n                de.json, en.json
  /shared                IPC contract: types and schemas
/resources               bundled templates, fonts, Typst, LanguageTool and Java runtime
/docs
  DECISIONS.md           decision log, append only
  DESIGN.md              design system (seeded from section 8)
/tests
  fixtures/              sample projects, golden exports
```

### 6.3 Tooling and packaging

- **Build:** electron-vite, with one Vite configuration for main, preload, and renderer. TypeScript in strict mode. ESLint and Prettier. The import-boundary check from 6.1 runs in CI.
- **Tests:** Vitest for the core and the main-process services. Playwright browser tests for components and the gallery, which run in Chromium, the same engine as Electron. Playwright's Electron support drives end-to-end tests of the real app. Golden tests export a fixture project and compare the result with stored output.
- **Packaging:** electron-builder (`electron-builder.yml`, `npm run package`). Targets: AppImage, deb, and rpm on Linux (Flatpak later), a signed and notarized dmg on macOS, and an installer on Windows. Typst, LanguageTool, the Java runtime, fonts, and templates ship as extra resources. Electron fuses are set at packaging time to harden the app.
- **Electron version:** pinned. Security releases are adopted promptly, and CI flags an outdated Electron.

### 6.4 Editor implementation

- One `EditorView` for the open sheet. Other sheets are not mounted.
- Widgets are replace decorations plus the `EditorView.atomicRanges` facet. Inline widgets can come from a view plugin. **Block widgets must come from a `StateField`**, not a view plugin.
- Async content (images) changes widget height. Call `requestMeasure` after load and provide an estimated height.
- Widget editing uses popovers and panels that dispatch normal transactions, so undo and redo work.
- The slash menu uses the autocomplete extension. The popups that open at the caret (the citation editor, the cross-reference picker) are centered horizontally on the editor, and the table toolbar over its table, through CodeMirror's tooltip API.
- For long-text performance: per-sheet documents, incrementally built decorations, and a debounced index.

**Parsing.** CodeMirror has no ready-made Typst language, so the project owns a small, tolerant Lezer grammar for the v1 subset:

- Anything starting with `#` that the grammar does not recognize is matched as an opaque expression by balanced parentheses, brackets, and strings, and kept as raw source. Typst the author writes outside the subset therefore never breaks the editor.
- Widget extents (footnotes, figures, tables, citations) come from the grammar, never from regular expressions.
- In tests only, the grammar's results are compared with what the bundled Typst reports for a fixture corpus (for example through `typst query` for headings, figures, footnotes, and labels), so drift is caught without a second parser at runtime.

**Risk by widget**

| Widget | Risk |
|---|---|
| Inline (citation chip, footnote marker, inline math, highlight, comment pill) | Low to medium |
| Image block | Medium |
| Margin notes | High |
| Table | Highest. Cells are edited in place (the one widget with editable content), which was tried first in a spike and holds: focus, undo, and redrawing while typing are tested. Tables with features the grid cannot hold stay source |

### 6.5 Data safety rules (non-negotiable)

1. Write every file atomically: write to a temp file in the same directory, flush, then rename.
2. Autosave with a short debounce, and always flush on blur and quit.
3. Never delete without going to the system trash.
4. Reconciliation never drops entries and never deletes files.
5. Keep versions of the project automatically (on by default, a hidden folder inside the project, no git knowledge needed; see 3.9), and recommend an independent backup. Versions protect against the writer's own mistakes, a backup against losing the disk.
6. The manifest, ordering, assembling, and preprocessing code require tests before they are used for real work.
7. Dogfood on copies of real material, never the only copy, until the app has earned trust.

### 6.6 IPC contract and security baseline

**IPC contract**

- Every call is declared once in `src/shared/ipc.ts`: channel, request type, response type, and schema. The preload API is generated from that declaration, the main process registers its handlers from it, and the renderer uses typed methods such as `window.api.project.open()`.
- The main process validates every request against its schema and checks the sender: the frame's URL must be the app's own origin.
- Events from main to renderer (file changes, checker status, compile results) use typed subscriptions that return an unsubscribe function.
- Errors cross the boundary as typed result objects, not as thrown exceptions with stack traces.
- The preload exposes narrow capabilities. It never exposes `ipcRenderer`, `fs`, or a generic "invoke any channel" function.

**Security baseline**

- `contextIsolation` on, `sandbox` on, `nodeIntegration` off, `webSecurity` on. No remote module.
- A strict Content Security Policy: same-origin scripts and styles only, no inline script, no `eval`.
- The renderer loads from a custom app protocol and not from file URLs. Project images and other assets are served through a second protocol handler that resolves paths inside the open project's root and rejects anything outside it.
- New windows and navigation are denied. External links open in the system browser, only for allowed schemes (https and mailto), through `shell.openExternal` called in the main process.
- Permission requests are denied.
- Child processes: no shell, fixed arguments, localhost-only binding, a random port, and no user-controlled command text.
- Packaging sets Electron fuses, for example disabling run-as-node and loading the app only from its archive.
- The Chromium sandbox stays enabled in every packaged build. `--no-sandbox` is never shipped as a workaround.
- Window chrome: the native title bar on Windows and Linux, which keeps window management consistent there, including Wayland. On macOS the title bar is merged with the toolbar (`titleBarStyle: 'hiddenInset'`): the traffic lights sit at the left of the toolbar, the toolbar's empty space moves the window, and without the toolbar (the welcome screen) a strip at the top does (see `docs/DECISIONS.md`).

---

## 7. Export, templates, and profiles

The same content can look very different. This works through three separate layers.

1. **Content.** The sheets. Only the v1 element set, with no styling. `#set` and `#show` rules in a sheet are shown as raw source, with an optional hint that styling belongs in the template **[OPEN]**.
2. **Template.** A Typst module that styles everything: page size and margins, fonts, headings, quotes, figures, tables, footnotes (bottom of page or margin notes), title page, table of contents, lists of figures, headers and footers, front-matter numbering, and the look of the bibliography. Bundled with the app, optionally also in a `templates/` folder inside the project.
3. **Export profile.** A named combination of template, template options, and export behavior, stored in `project.toml`. A project can have several, for example "Abgabe" and "Prüfversion".

### 7.1 Pipeline

1. Preprocess the sheets per profile: highlights shown or hidden, comments removed, turned into margin notes, or turned into footnotes. Removed text is replaced by the same number of newlines, so line numbers stay stable and compiler errors map back to sheets.
2. Assemble `_build/main.typ`: import the prelude and the template, apply `#show: project.with(...)`, declare the bibliography, then include the sheets in export order (section 5.1).
3. Compile with the bundled Typst, with `--root` at the project, `--font-path` at the bundled fonts, and `--ignore-system-fonts` so output is reproducible. Options reach the template as data.
4. Map diagnostics back to sheets and show them in the editor.

**What is built (first slice).** "Als PDF exportieren …" in the project menu (Shift+Cmd+E) opens the export dialog: the template, its options (generated from `template.toml`), the citation style, what happens to highlights (hide, show as marked text) and to comments (leave out, show as footnotes), and what is still open in the sheets (open comments, missing and to-check citations, citations without an entry in the bibliography, cross-references to headings that are not in the export; a click goes to the place). "Exportieren …" asks where to save, writes the profile to `project.toml` (`[[export]]`), prepares `_build/`, compiles, and reports the pages or the errors per sheet and line. Preprocessing writes copies of the sheets to `_build/content/` and never touches the originals. Sheets use only Typst's own elements after preprocessing (`#highlight`, `#footnote`, `#link`), so the prelude is nearly empty and the template styles them with show rules. A reference to a heading becomes `#link(<sec-x>)[Abschnitt 2.1]` with the number the app has counted (in the template's number format, or the heading's title in quotation marks where the template does not number that level), so it needs no numbering from the template; references to figures, tables, and equations stay Typst's own (`@fig-…`), so chapter-based numbers and the like follow the template. Image paths are made absolute from the project (`/assets/a.png`). A citation of a work the bibliography does not have prints as its key in brackets with a question mark ("[fehlt2000?]", in red) instead of stopping the compiler, and is listed among what is still open. The compiler gets a clean copy of the bibliography in `_build/bibliography.bib`, never the writer's file: only the cited works (and what they cross-reference) with the `@string` macros, each key once, no entry that is not closed, every year and date readable ("circa 1900" becomes 1900), and chapters and conference papers written as `@inbook`, which Typst 0.13 otherwise prints wrongly. Not yet: margin notes, templates inside the project.

### 7.2 Prelude

A stable module that defines the app-defined elements (highlight, comment, subfigures). They call style hooks supplied by the template, so a template can restyle them: a highlight is invisible in a final version and yellow in a review draft.

### 7.3 Template contract

- `lib.typ` exports `project(meta, body)` and the hooks.
- `template.toml` describes the template: name, description, options (type, default, German and English labels), required fonts, and supported features (margin notes, list of figures, and so on). The export dialog builds its options form from this file. There is no hand-written settings screen per template.

**Structured templates.** Bundled templates are split into an engine and a style:

- `templates/engine.typ` is the engine, shared by every template (a template may bring its own `lib.typ`). It is written by the project and applies the style. It contains no hard-coded visual values.
- `style.toml` holds all visual values, per element (`engine = 2`): `[element.heading_2]`, `[element.footnote]`, and so on. The registry in `src/core/export/elements.ts` is the one list of elements and of the properties each can have (font, size, weight, italic, colour, alignment, space above and below, indents, line and paragraph spacing, numbering, page break, rules, margins); it also gives each property its type, German and English label, and the element it inherits from. An element that sets a property uses its own value, else its built-in default, else its parent's (a level 2 heading takes it from all headings, those from the body text), so a change high up reaches everything under it. A style may be sparse. Values are checked against strict patterns (lengths, hex colours, font names, enums), reported and left out when invalid, and written for the compiler as literals of their type into a generated `style.typ`; nothing in a style can run code.

This keeps the later graphical editor possible without a redesign:

1. The v1 options form and the later graphical editor are the same mechanism: a form generated from the schema.
2. Styles are plain, diffable, versioned TOML (`engine = 1`, with migrations when the schema changes).
3. Bundled templates are read-only. **Templates belong to the application, not to a project**: the app ships several, the writer makes their own with the template editor by duplicating one and changing it, and a change applies only to that template. An export profile in a project names a template by id. A custom template is stored as a base plus the values the writer changed (so improvements to the bundled engine reach every value that was not changed, and "reset" deletes the value), in the app's data folder, with any fonts the writer added to it. Templates are shared between machines as files (export and import). A project that names a template the machine does not have cannot export; keeping a copy of the template in the project is marked for later (the export is done at the end, and portability is not required before).

**The export and template dialog** (one dialog, from the project menu; it needs an open project, for the preview and the export): a narrow column of templates on the far left, each a small picture of the first text page made by the compiler from a sample text (the bundled ones marked with a lock and read-only, and the writer's own), with "Make a copy …", rename, delete (to the system trash), load from and save to a file below; the chosen template is the export's template, and closing the dialog (or exporting) remembers it in the project's profile. Next to the list the panel "Export" (the template's options, citation style, what happens to highlights and comments, what is still open in the text, the result of the last export; the "Export …" button is in the header), and the elements in one flat list of groups that fold out on the same level (Seite with paper size, facing or single pages, margins, header, footer, page number and colours; Titelseite; Text with body text and highlight; Überschriften with "all" and the four levels; Aufzählungen; Zitate with a quote in the text, a block quote and an epigraph; Verweise with cross-references, citations, footnotes (at the foot of the page or as Tufte-style margin notes) and links (colour, weight, italics, background, underlining, besides the words of the cross-references); Verzeichnisse with the contents, the list of figures, the list of tables and the bibliography; Tabellen; Abbildungen; Formeln; Code; a group with one entry is just that entry; one group is open at a time, its entries on a background of their own, and each group has a symbol), the properties of the chosen element in the middle (a field per type: length, font with the known families, colour with a swatch, enum, switch; a value the element does not set itself is marked "inherited", one the writer changed "changed" with a reset to the base's value), and the pages of the preview on the right, made again 0.6 s after the last change with the profile as it is being edited (template, options, citation style, marks, comments), not only the saved one. A change is written at once. The writer's own templates are stored in the app's data folder, `templates/<id>/custom.toml` (name, base) and `style.toml` (only the values changed), so the base's later improvements reach them; a copy of a copy is a copy of the bundled base with the values so far. **Fonts.** The compiler ignores the system's fonts (so the output is the same on every machine) and brings New Computer Modern, Libertinus Serif and DejaVu Sans Mono. The writer adds font files (`.ttf`, `.otf`, `.ttc`, `.otc`) to a template of their own from the editor's "Eigene Schriften" panel; they are copied into `templates/<id>/fonts/` and given to the compiler with `--font-path`, for the preview and the export alike. The families of the added files are offered when a property names a font (the list comes from `typst fonts`, so no font-parsing dependency), and the panel reminds the writer to check a font's licence. A bundled template cannot take fonts. **Headings.** Each level, and "all headings", has alignment (three radio buttons), and a decorative line above and below the text, each with colour, thickness, length (a length or a percentage) and distance to the text; the line follows the alignment of the heading. The letter case of a heading is normal, all caps or small caps (radio buttons).

**Options.** The options the export dialog offers (title page, contents, author, line spacing, …) come from the base template. In the editor's "Optionen" panel a template of the writer's own can give each option another default, and can leave it out of the dialog altogether (it then keeps its default). A bundled template's options cannot be changed. The size of the text (the element "Fließtext") and the paper size (the element "Ränder und Spalten": A3, A4, A5, B5, US Letter, US Legal) are properties of the template, not options of the export: a different size is a copy of the template. Choosing another template in the export dialog keeps what the writer chose and gives the new template's defaults to the rest.

**Chapter breaks.** Each heading level can start on a new page or on the next right-hand page (a blank page is inserted where needed), or not break at all; the option "Kapitel auf neuer Seite" of the thesis template still turns the breaks of chapters off.

**Bibliography.** Besides the text properties, a title of its own (the language's by default), an indent from the second line of an entry, and the space between entries. The citation style stays a choice of the export profile.

**Captions and reference wording.** A caption can stand above or below its figure or table (set separately for tables), be aligned left, middle or right, and have a mark after the number (a colon, a point, a dash, a space); the words "Abbildung", "Tabelle", "Gleichung" and "Abschnitt" can be replaced ("Abb.", "Tab.", "Gl.", "Kap."). The PDF, the links and the chips in the text, and the captions of figures and tables in the editor follow the template of the saved export profile. Numbering by chapter (Abbildung 2.1) is not offered: the editor counts figures, tables and formulas across the whole project, and the chapter counters would have to be taken into every widget.

**Lists, footnotes, equations, code.** Lists: the bullet (the usual three levels, a point, a dash, a circle, a square), the numbering of numbered lists (1. · 1) · (1) · a) · a. · A. · i.), the distance to the text, and the space between items. Footnotes: the space between notes and their indent. Equations: the place of the number (left or right) and the size. Code blocks: a background, padding and rounded corners. The number format of footnotes is not offered: the editor shows the numbers it counts, and the markers and cards would need the format too.

**Colours.** "Farben" holds two colours of the palette (an accent colour and a second colour). Any other colour can name one of them instead of a hex value (a menu next to each colour), and then follows the palette when it changes; the palette's own colours are always hex values.

**Headers, footers and page numbers.** "Kopfzeile" and "Fußzeile" have three places (left, middle, right), each empty or the page number, the title of the chapter or of the section on the page, the title of the work, or the author; a switch to mirror left and right on even pages (for print on both sides), one to leave the header off pages where a chapter starts, one for the chapter number, the distance to the text area, text properties like every element, and a divider line with colour, thickness and distance. The footer has the page number in the middle by default, the header nothing. "Seitenzahl" sets how the number looks (the number only, with dashes, with a word) and its format in the text and in the front matter (roman by default). The title page has no header or footer; the contents and lists have the footer and no header.

**Tables and quotes.** A table has rules (between rows, three rules, a grid, none), cell padding, cell alignment, a header in bold with a background, and a background on every second row. A block quote can have a bar at the left, a background and padding.

**Heading numbers, more.** A word before the number ("Kapitel 1"), a mark after it (a point or a bracket), the gap to the title, long titles that hang under the title instead of the number, and the separator between the levels (a point, a hyphen, a space). The contents have a title of their own, the deepest level shown, dots or no leader before the page numbers, and a weight for the chapters.

**Columns.** The text (not the title page, contents or lists) can be set in one, two or three columns with a gap of its own, and figures can be made to span all columns. Headings cannot span columns, and there is no rule between them.

**Text properties.** Every element that prints text (body, headings, quotes, epigraph and its source, captions, tables, footnotes, contents, bibliography, code, the title page lines) has a font, size, weight, italic and colour, taken from its parent when unset; headings and the title page lines also have a letter spacing.

**Heading numbers.** The format of each level is arabic (1), roman (I or i) or alphabetical (A or a), set per level, and "Nummerieren bis" on all headings sets the deepest numbered level (none, 1 to 5, or all). Numbers join the levels with a point (`II.3.a`). A heading below the depth has no number; a reference to it names it by its title in quotation marks. The cross-reference chips in the text and the links in the PDF count with the same rules, using the template of the saved export profile.

**Template files.** "Als Datei speichern …" writes a template of the writer's own, with its fonts, as one `.ezetta-template` file (a zip: `<id>/custom.toml`, `<id>/style.toml`, `<id>/fonts/…`), and "Aus Datei laden …" adds one as a template of the writer's own: the values and fonts are read again and only valid ones are kept (nothing else in the file is used), the id is made new when it is taken, and a file based on a bundled template this version does not have is refused with that reason. A file from a hostile source cannot write outside the template's folder (the same checked unzip as the backups). This is how templates move between machines. Not yet: a copy of the template inside the project.

Style groups of the registry: page, text, headings (levels 1 to 4), quotes (block quote, epigraph and its source), figures and tables (figure, captions, table), footnotes and lists, special (code, links, highlight), title page. Golden tests (`tests/golden`, `src/main/services/golden.test.ts`) hash the SVG pages of a fixed project in every bundled template, so a change to the engine or a style shows which pages moved (`UPDATE_GOLDEN=1` records new hashes, `GOLDEN_DUMP` keeps the pages).

### 7.4 Bundled templates

- **Monographie:** a book in burgundy and small caps for a monograph or thesis: facing pages, indented paragraphs, chapters on new pages above a short rule, the chapter and section in the running head, title page, contents, roman front-matter numbering, footnotes at the bottom.
- **Zeitschrift:** a journal article in two columns in New Computer Modern: 9.5 pt, justified, a running head over a hairline, figures that span both columns, three-rule tables, no title page.
- **Randnotizen:** Tufte style: a narrow column of text with every footnote in the outer margin beside its line, italic headings without numbers, quotes with a bar.
- **Manuskript:** typewriter pages for editors and reviewers: a monospaced face, wide line spacing, first-line indents, a running head with author, title and page, a wide outer margin for notes, highlights, links and citations that stand out (comments as footnotes are in the export profile; comments in the margin are not built).
- **Technischer Bericht:** a report in colour: teal monospaced headings with a rule under each chapter title, boxed quotes and code, tinted tables, a footer with the title over a coloured hairline, lists of figures and tables.
- **Essay:** a small format (A5) with centred small-caps headings above a short ornamental rule, no numbers, indented paragraphs, and page numbers between dashes.

The first four were chosen to show what the export can do: facing pages and running heads, columns, notes in the margin, and a manuscript's spacing; the report shows colour and the boxes, the essay the small format.

Templates bundle open-licensed fonts with their license files, so preview and export look the same on every machine.

### 7.5 Example profile

```toml
[[export]]
name = "Abgabe"
template = "monographie"
citation_style = "apa-7"
marks = "hide"          # hide | show
comments = "remove"     # remove | margin | footnote

  [export.options]
  line_spacing = "normal"
  margin_notes = false
  chapter_new_page = true
  list_of_figures = true
```

### 7.6 Editor versus PDF

The editor's look comes from the app theme and is unaffected by templates.

The **preview** of the pages is in the export and template dialog only (section 7.3); the editor has no preview pane. The dialog prepares the project like for an export, with the profile as it is being edited, and the bundled Typst compiles it into one PNG per page, shown in a scrolling column beside the properties; they are made again 0.6 s after the last change of the profile, and a refresh that is still running when the next is asked for is cancelled. When the compiler stops, the column says so; the errors per sheet and line are in the result of the export. The pages live in `_build/preview` and are made again on every refresh; an export and a preview never write `_build` at the same time.

### 7.7 Tests

Export a fixture project with each bundled template. Compare page count and extracted text, and use image comparison on selected pages.

---

## 8. Design system

**The foundation (approved 2026-10-18; the screens move onto it step by step).** A strict base replaces the loose set of tokens: colours by role (window, sidebar, panel, label, secondary and tertiary label, separator, control, field, accent, selection, danger), one spacing scale (4, 8, 12, 16, 24, 32), three radii (4, 6, 10), five type roles (large title, title, emphasis, body, caption), and macOS proportions: 13 px interface text, controls of 22, 28 and 32 px, rows of 28 and 44 px. The interface is native in character (macOS), the writing surface editorial (its own faces, sizes and measure, 8.3). The values are in `src/renderer/ui/foundation.css`; the building blocks every screen is made of are in `src/renderer/ui/kit/` (button, icon button, text field, select, checkbox, switch, segmented control, tabs, list row, form and form row, section, dialog, popover, callout, empty state); `docs/DESIGN.md` ("Foundation") holds the rules. Until a screen is rebuilt on it, 8.1 to 8.4 describe that screen.

### 8.1 Principles

Restyled on 2026-10-06 in the direction of Anytype, then rebuilt on 2026-10-18/19 on a strict design foundation with macOS proportions (see `docs/DECISIONS.md`; `docs/DESIGN.md` is the working reference).

- Native in the interface, editorial in the text: macOS proportions, sizes and controls around the writing surface, which has its own faces, size, spacing and measure.
- Calm and light: a white window; content is grouped by sections and hairlines, not by cards (the sheet cards in the sidebar and the badge in the corner of the text are the deliberate exceptions). The chosen row of a list has the pale accent ground of the selection.
- Affordance and clarity: controls look like controls. Buttons are flat soft fills, not outlines; they show hover and pressed states. Only real input fields have borders.
- Nothing important appears only on hover.
- One size for everyone: 13 px interface text, controls of 22, 28 and 32 px, rows of 28 and 44 px. There is no density setting (removed on 2026-10-19).
- Labels are visible, except in the toolbar, where universal icons stand alone and every tool keeps its name as a tooltip and for screen readers (3.3).
- Radii: 4 px for fields and tags, 6 px for buttons and rows, 10 px for popovers and dialogs. Hairline borders. Shadows only on things that float (menus, dialogs, popovers, toasts).
- One accent colour (petrol). Status colours are the roles danger, warning and success.
- Serif only on the writing surface, the system's font for the UI.
- Themes: light, dark, and sepia. Reduced motion is respected.

### 8.2 Tokens

Defined as CSS custom properties in `src/renderer/ui/foundation.css`, the only source; `docs/DESIGN.md` lists them. Colours are named by role and set by every theme (window, sidebar, panel; three label colours; separator; control with hover, pressed and raised; field and its border; accent, text on the accent, selection, focus; danger, warning, success; and a few for the text: the mark, the danger ground, the quote's ground, the colours of a folder's symbol, paper). The accent is one hue and chroma in OKLCH (hue 205, chroma 0.075); each theme sets only its lightness, and the selection's ground is mixed from it. Focus is one ring everywhere: a 3 px halo in the focus colour. The other tokens: a spacing scale (4, 8, 12, 16, 24, 32), three radii, five type roles (22/28 bold, 15/20 semibold, 13/18 semibold, 13/18, 11/14), control, row and bar sizes, the writing surface's face, size, line spacing and measure, three shadows, the layers, and one duration.

### 8.3 Typography

- Writing face: Libertinus Serif (bundled) by default, about 18 px, line height 1.65, a column of about 74 characters (760 px including padding). The writer chooses the style (serif, sans-serif, monospace), the size and the line spacing in the settings (3.8).
- UI face: the system font (San Francisco on macOS, Segoe UI on Windows), with the bundled Inter where there is none; 13 px. A large title is 22 px bold.
- Fonts are bundled locally. Check umlauts, ß, italics, small caps, tabular figures, and footnote numerals.

### 8.4 Components

Button (flat default, ghost, rare primary), toolbar item (icon, optional label beside it, optional chevron), field, select, segmented control, sidebar row, sheet row (first lines, status, count), sheet badge (status, words), status dot, chip (status, path, citation, cross-reference), comment pill, margin card, popover, menu, dialog, status bar item, and tooltip (with shortcut). Each is built once and reused everywhere.

### 8.5 Keeping it cohesive

- This section plus the tokens seed `docs/DESIGN.md`, the working reference for the look.
- A component gallery page shows every component in every state, in light, dark, and sepia.
- Playwright screenshot tests on the gallery catch accidental drift (`npm run test:gallery`).
- No ad-hoc colors, spacing, or fonts in components. Everything goes through tokens; a lint rule and a style check (`npm run check`) enforce it.
- One icon set only: Tabler (outline, MIT), named in one place (`src/renderer/ui/Icon.svelte`).

---

## 9. Internationalization

- UI languages: German and English from the first commit. No hard-coded user-facing strings.
- One i18n library is chosen in milestone 1 and recorded in `docs/DECISIONS.md`.
- The project's `language` setting drives hyphenation, quotation marks („…“ for German), and the CSL locale. Number formatting in the UI follows the UI language (2.140 in German).
- German terms: Betont, Wichtig, Beleg, Fußnote, Bild, Tabelle, Gleichung, Querverweis, Anmerkung (highlight), Kommentar (non-printing comment), Prüfen, Literatur, Gruppe (folder), Abschnitt (sheet), Gliederung (outline), Entwurf, Überarbeitet, Final.

---

## 10. Platform and the Linux spike

Electron ships its own Chromium, so the editor renders the same way on Linux, macOS, and Windows. Linux still needs early attention in three areas: the display server (X11 and Wayland), packaging formats, and the Chromium sandbox in packaged builds.

Linux is supported from the first release (decided 2026-10-23, see `docs/DECISIONS.md`). The checks of the spike below are the test plan for it on a real Linux system.

### Milestone 0: spike (week 1)

A small spike, run on the author's actual Linux setup (X11 and Wayland if possible):

- An Electron app with Svelte and CodeMirror, and three widgets over placeholder syntax: a citation chip, a footnote marker with a margin card, and an image block.
- A resizable margin column and sidebars. Resize the window a lot.
- Type German text with dead keys and umlauts.
- Scroll a long document with widgets.
- Start LanguageTool as a child process, check one paragraph, and record startup time, latency, and memory use.
- Build packaged Linux versions (AppImage and deb) and confirm that they start with the Chromium sandbox enabled.
- Measure installer size and memory use.

Checkpoint after the spike: if three widgets already feel fragile, the editor core is reconsidered. Installer size and memory are reviewed, and the runtime trimming is planned accordingly.

---

## 11. Milestones

Time estimates are rough guesses for one person working part-time, not commitments.

### M0: Spike (1 to 2 weeks)

Section 10. Outcome: confirmation that the CodeMirror widgets and the packaged Linux builds work well, plus measured numbers for startup, memory, and installer size.

### M1: Project and editor (a few days to 2 weeks)

- The Electron shell (main, preload, renderer) with the typed IPC contract and the security baseline, Svelte, CodeMirror, design tokens, and the component gallery skeleton.
- The import-boundary check in CI, and the packaging tool chosen.
- Create and open projects. Manifest read and write. Reconciliation with the disk.
- The two-column sidebar (groups and sheets) with the single-column mode, drag and drop, create, rename, and delete to trash, status, word counts, goals, and the export flag.
- Plain-text editor with Typst source, basic styling, and atomic autosave.
- Assemble dry run.
- i18n skeleton (German and English). Command palette skeleton.
- Tests for manifest, reconciliation, ordering, atomic write, assembling, and word counts.

Acceptance: a fixture project with ten groups and nested subgroups opens, reorders, edits, and saves without data loss, including external renames and git operations.

### M2: Academic layer (3 to 8 weeks)

- The Typst grammar and semantic index.
- Basic styling for emphasis, strong, headings, lists, quotes, and links.
- Citation chips, `@` autocomplete, the Beleg dialog, bibliography loading and watching.
- Footnotes with the margin column (v1) and popover editing.
- Figures, subfigures, inline images, tables (source plus optional popup), formulas, and cross-references.
- The works-cited sidebar.
- The Gliederung (outline) mode of the sidebar: headings in export order, jump to heading, skipped-level warnings.
- Spelling and grammar (section 4.7): text extraction from the index, the LanguageTool client, underlines and suggestions, the "Prüfung" tab, personal and project dictionaries, and the proofing settings.
- Highlights and comments, the slash menu, and the toolbar.

### M3: Export (2 to 4 weeks)

- The bundled Typst compiler, assembling, and preprocessing.
- The prelude and the structured template format.
- The three bundled templates, the export dialog with profiles, and the citation style picker.
- A paged preview and diagnostics mapped back to sheets.
- The open-comment warning. Golden export tests.

### M4: Polish and distribution (3 to 6 weeks)

- Installers and signing for Linux, macOS, and Windows.
- A performance test: about 300 pages, 500 citations, 100 footnotes, 10 groups.
- Accessibility pass. Themes.
- Packaging of LanguageTool and a trimmed Java runtime for all three platforms, with an installer size check and the optional n-gram download.
- Zotero auto-export workflow documentation.

---

## 12. Later stages

- **Graphical template editor.** "Stil anpassen": edit the style of a copied template through the generated form, with a live preview of a sample document that contains every element. It needs incremental compilation (section 6.1). Dedicated designers for headers, footers, and the title page follow, because they are layout-heavy.
- **Editing in the continuous view.** Typing in the continuous view, with selection, search, and undo across sheets, as in Ulysses. One document holds the selected sheets with protected separators, and on save the text is split back into the sheets' files. It needs tests for edits at sheet edges, paste across a separator, undo, and external changes, because it touches data safety.
- **Editable margin cards.** Margin notes edited in place, through a nested CodeMirror view that edits the note's inner range and maps changes back to the main document.
- **Parallel text (Paralleltext).** A generic block of two or three cells side by side, for example a quotation and its translation. The app does not define what the cells mean. Each cell holds normal inline content and may have a short label and a language. It is stored as an app-defined prelude function (`#parallel[…][…]`) and laid out as a grid in the PDF. The block stays within the text width, stays together on one page, and stacks in a narrow window. Footnotes inside cells are collected below the block. The first version edits by revealing the linear source when the cursor enters the block. A later version adds one nested editor per cell.
- **Word and Markdown export.** The app converts its own parse tree to Pandoc's document format and runs Pandoc on that. This keeps citation page references and lets the app resolve cross-references and numbering itself. The element set is small, so the converter is a bounded task.
- **Margin notes in print.** Notes as margin notes in the PDF, through a Typst package such as Marginalia, offered by a template option.
- **Library.** Import of other bibliography formats, and the right sidebar as a browser for the whole library.
- **User fonts.** A project `fonts/` folder, balanced against reproducible output.
- **Richer proofing.** Checking passages in other languages by their language tag, checking across the whole project in the background, and custom rules.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Linux specifics (Wayland and X11, packaging, the Chromium sandbox in packaged builds) | Week-1 spike with packaged builds on real Linux. Section 10. |
| Installer size and memory (Chromium, Java runtime, Typst) | Measure in the spike. Trimmed runtime. Lazy background start of the checker. |
| Electron and Chromium security updates | Pinned version, prompt bumps for security releases, a CI check for outdated Electron. |
| CodeMirror widget edge cases (cursor, selection, input methods, copy and paste) | The behavior contract per widget. Reveal-source behavior. A small v1 widget set. |
| Margin note alignment and collisions | A simple v1 with a collision pass. In-place editing is deferred. |
| Typst version drift | Pin the Typst version. Golden tests. |
| Bundling LanguageTool and a Java runtime (installer size, startup time, memory) | Measure in the spike. Lazy background start. Configurable heap. The external-server setting as a fallback. |
| Data loss from bugs in autosave or manifest handling | Section 6.5. |
| Manifest drift from external changes | The reconciliation rules in 5.3. |
| Scope creep | The element set in section 4. Milestone acceptance criteria. |

---

## 14. Licensing and name

The app is open source. The license is GPL-3.0-or-later (decided 2026-10-25, see `docs/DECISIONS.md`), which keeps derivatives open. Typst is bundled as a separate binary, so ship its license text and a link to its source. LanguageTool (LGPL 2.1 or later) is bundled unmodified as a separate server process, so ship its license text and a link to its source as well. The thesaurus files are shipped with their licences: OpenThesaurus (LGPL 2.1 or later, or CC BY-SA 4.0, with a link to openthesaurus.de) and the WordNet licence. Electron (MIT) is bundled together with the licenses of Chromium and its other components, which every build includes. Bundled fonts carry their own open licenses, shipped with them. The app is called Ezetta.

---

## 15. To confirm early during implementation

- Subfigure numbering: a Typst package (for example `subpar`) or counters implemented in the prelude. Check license and behavior.
- The Marginalia package, for margin notes in print: license and version.
- How template options reach the template: `sys.inputs` (`--input`) or files it reads with `toml()` or `json()`.
- How style hooks for the app-defined elements are implemented: state and `context`, or custom elements.
- Whether extra whitespace in multi-line footnotes changes the rendered output.
- The escape form for a literal `::` in Typst source.
- Which bibliography file formats the bundled Typst accepts (`.bib`, and others).
- LanguageTool: that returned offsets refer to the original text when markup and stand-in text (`interpretAs`) are used, so results map back to the Typst source correctly.
- LanguageTool: the Java version it needs, the size of a trimmed runtime, startup time, and memory with only German and English loaded.
- LanguageTool: that the bundled server accepts the parameters the app needs (level, disabled rules, variants), and which features exist only in the paid service.
- The packaging tool (Electron Forge or electron-builder) and the Linux formats (AppImage, deb, rpm; Flatpak later).
- Wayland and X11 behavior, window controls, and file dialogs on the target distributions.
- That the Chromium sandbox works in the packaged Linux builds.
- Whether `typst query` and the compiler's diagnostics are machine-readable enough for the grammar tests and for mapping errors to sheets.
- Preview rendering: SVG or PNG pages from Typst, or the PDF through pdf.js.
- Behavior of recursive file watching on all three platforms, and which library to use.
- The Typst version to pin (0.15.1 at the time of writing) and its license.

---

## 16. Working agreements

1. Read this spec and `docs/DESIGN.md` before a larger change; `CONTRIBUTING.md` has the day-to-day rules.
2. Keep business logic in `src/core` with tests, and keep the main process a thin adapter layer. Respect the dependency rule and the security baseline (sections 6.1 and 6.6): never expose `ipcRenderer`, Node, or Electron APIs to the renderer, declare every IPC method in `src/shared/ipc.ts`, and validate it in the main process.
3. Do not change a decision in sections 2, 6, or 8 without discussing it first. Log any accepted change in `docs/DECISIONS.md`.
4. A feature is done only when it has tests, German and English strings, keyboard access, and a gallery entry for any new component.
5. Prefer small commits, each leaving the app working.
6. Add a dependency only with a short justification in the commit message. Prefer well-maintained libraries with permissive licenses.
7. For anything that must be tried by hand on a machine (window behavior, Linux packaging, display servers), the change says exactly what to run and what to look for.
8. Never use real thesis files during development. Use fixtures.
