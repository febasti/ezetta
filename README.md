# Ezetta

A desktop app for writing long academic texts, such as a doctoral thesis. The text stays plain [Typst](https://typst.app) in ordinary files, while the editor shows it the way a writer thinks of it: citations as chips, footnotes in the margin, tables and formulas drawn in place. The PDF comes from Typst, with templates the writer can adjust.

Ezetta is in active development, and its first release (0.9) is a pre-release: expect rough edges, and keep a copy of anything that matters. It is made for macOS, Linux and Windows. The interface is in German and English.

## What it does

- **Projects of sheets.** A text is split into sheets, ordered in groups that are folders on disk. Each sheet has a status and a word goal, and the statistics cover a sheet, a group or the whole project. An outline shows the headings of the whole project, numbered as the PDF numbers them.
- **An editor over plain Typst.** Emphasis, headings, lists, links and quotes, figures and tables are shown styled, and their syntax stays out of the way. Nothing is stored in a hidden format, so every file also compiles without the app.
- **Citations** from a BibTeX file (from Zotero, for example), shown as chips, with a marker for places that still need one and a list of the works cited. Adding citations is easy from within Ezetta.
- **Cross-references** to headings, figures, tables and formulas, which say what the PDF will print ("Abbildung 3", "Abschnitt 2.1").
- **Footnotes, images, tables and formulas**, edited where they stand. Formulas are drawn by Typst itself.
- **Spelling, grammar and synonyms** with [LanguageTool](https://languagetool.org), running on the machine and never sending text anywhere.
- **A title page and front matter** (title, authors, date, version, abstract, dedication, preface) edited while writing, and printed by the template.
- **An example project** on the start screen: a tour of Ezetta, written in Ezetta, in German and English. It opens as a copy, so the original stays as it is however much is tried out.
- **Versions** are kept automatically, and backups go to a folder of the writer's choice.
- **PDF export** with six bundled templates and a template editor with a live preview; any font installed on the computer can be used, with only the weights and styles it has offered.

## Download

The packages are on the [releases page](https://github.com/febasti/ezetta/releases). They bring everything the app needs (Typst, LanguageTool, a Java runtime and the thesaurus files), which is why they are about 260 MB. Nothing else has to be installed.

| System               | File                               |
| -------------------- | ---------------------------------- |
| macOS, Apple Silicon | `Ezetta-<version>-arm64.dmg`       |
| macOS, Intel         | `Ezetta-<version>-x64.dmg`         |
| Linux, 64 bit        | `Ezetta-<version>-x86_64.AppImage` |
| Windows, 64 bit      | `Ezetta-Setup-<version>-x64.exe`   |

`SHA256SUMS.txt` on the same page lists the checksum of each file (`shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux, `Get-FileHash <file>` in PowerShell on Windows).

### macOS: the first start

The app is not notarized (that needs a paid Apple developer account), so macOS asks before it opens a downloaded copy for the first time. Open the dmg, drag Ezetta into Applications, then:

1. Open Ezetta from Applications. macOS says it cannot verify the app.
2. Open System Settings, then Privacy & Security, scroll down to the Security section and choose **Open Anyway** (in German: "Dennoch öffnen"). Confirm with your password. This is needed once.

On macOS 14 and older, a right click on the app and **Open** ("Öffnen") does the same in one step.

If you prefer the terminal, this removes the download mark and the question does not come up:

```bash
xattr -dr com.apple.quarantine /Applications/Ezetta.app
```

### Linux

The Linux version has only been tested on Arch Linux.

Make the file executable and start it:

```bash
chmod +x Ezetta-*.AppImage
./Ezetta-*.AppImage
```

AppImages need FUSE 2 (the package `libfuse2`, or `fuse2` on Arch). Without it, `./Ezetta-*.AppImage --appimage-extract-and-run` starts the app anyway.

### Windows

The Windows version is new since 0.9.3.

Run the installer. It installs Ezetta for your user account and needs no administrator rights. The installer is not signed, so Windows SmartScreen warns the first time: choose **More info**, then **Run anyway**. Ezetta is removed again under Settings, Apps; its settings and templates stay.

## Building from source

You need macOS or Linux, Node 22.12 or newer, and npm.

```bash
npm install
npm run dev
```

Formulas and the export need [Typst](https://github.com/typst/typst) 0.15.1 (`brew install typst`). Spelling, grammar and synonyms need Java and the files that `npm run fetch:dev-data` downloads. [CONTRIBUTING.md](CONTRIBUTING.md) has the details, every command, and how the code is organised.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): setting up, the rules the code keeps to, tests and commands
- [docs/DESIGN.md](docs/DESIGN.md): the design system

## License

Copyright © 2026 Felix Schorn. Ezetta is free software, released under the [GNU General Public License](LICENSE), version 3 or any later version. The programs it bundles (Typst, LanguageTool, the thesaurus files) keep their own licenses, listed in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) and in the app's Info tab (Settings).
