# Ezetta

A desktop app for writing long academic texts, such as a doctoral thesis. The text stays plain [Typst](https://typst.app) in ordinary files, while the editor shows it the way a writer thinks of it: citations as chips, footnotes in the margin, tables and formulas drawn in place. The PDF comes from Typst, with templates the writer can adjust.

Ezetta is in active development and not released yet. It is made for macOS and Linux; Windows comes later. The interface is in German and English.

## What it does

- **Projects of sheets.** A text is split into sheets, ordered in groups that are folders on disk. Each sheet has a status and a word goal, and the statistics cover a sheet, a group or the whole project. An outline shows the headings of the whole project, numbered as the PDF numbers them.
- **An editor over plain Typst.** Emphasis, headings, lists, links and quotes are shown styled, and their syntax stays out of the way. Nothing is stored in a hidden format, so every file also compiles without the app.
- **Citations** from a BibTeX file (from Zotero, for example), shown as chips, in five forms, with a marker for places that still need one and a list of the works cited.
- **Cross-references** to headings, figures, tables and formulas, which say what the PDF will print ("Abbildung 3", "Abschnitt 2.1").
- **Footnotes, images, tables and formulas**, edited where they stand. Formulas are drawn by Typst itself.
- **Spelling, grammar and synonyms** with [LanguageTool](https://languagetool.org), running on the machine and never sending text anywhere. Synonyms come in the form the sentence needs.
- **Versions** are kept automatically, and backups go to a folder of the writer's choice (one a cloud service syncs, for example).
- **PDF export** with three bundled templates and a template editor with a live preview, custom fonts included.

## Getting started

You need macOS, Node 22.12 or newer, and npm.

```bash
npm install
npm run dev
```

Formulas and the export need [Typst](https://github.com/typst/typst) 0.15.1 (`brew install typst`). Spelling, grammar and synonyms need Java and the files that `npm run fetch:dev-data` downloads. [CONTRIBUTING.md](CONTRIBUTING.md) has the details, every command, and how the code is organised.

The first start shows a welcome screen, where you create a project or open a folder that contains a `project.toml`. Try it with a copy of real material, never the only copy.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): setting up, the rules the code keeps to, tests and commands
- [SPEC.md](SPEC.md): what the app is meant to be, in full
- [docs/DESIGN.md](docs/DESIGN.md): the design system
- [docs/DECISIONS.md](docs/DECISIONS.md): the decisions made so far, and why
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measurements on a large project, and the budgets

## License

Copyright © 2026 Felix Schorn. Ezetta is free software, released under the [GNU General Public License](LICENSE), version 3 or any later version. The programs it bundles (Typst, LanguageTool, the thesaurus files) keep their own licenses, listed in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) and in the app's Info tab (Settings).
