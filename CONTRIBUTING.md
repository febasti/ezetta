# Contributing to Ezetta

Thank you for helping. This guide covers setting up, the rules the code keeps to, and what to run before a commit. The look is described in [docs/DESIGN.md](docs/DESIGN.md).

## Setting up

The app is made for macOS and Linux from the first release. Windows is being added: its unit and end-to-end tests run in CI, and the release workflow builds an installer for it.

- **Node 22.12 or newer** (`nvm use` reads `.nvmrc`) and npm.
- **Typst 0.15.1**, the version the app ships, for formula previews, the export and the golden tests: `brew install typst`, or point `EZETTA_TYPST` at another binary. Without it, formulas show as source.
- **Spelling, grammar and synonyms** need LanguageTool and the thesaurus files: `npm run fetch:dev-data` downloads them into `.dev/` (not in git). They run on Java; compiling the morphology helper in `tools/morph` needs a JDK 17 or newer.

```bash
npm install
npm run dev
```

Try things with a copy of real material, never the only copy. The tests use the projects in `tests/fixtures` and generated ones, never real files.

## Before you commit

- Run `npm run check`: formatting, lint, type checks, the import boundaries, the design check, and the unit tests. CI runs the same.
- Run `npm run test:e2e` when you change what the app does. It builds the app and drives it with Playwright.
- When you change the look on purpose, run `npm run test:gallery -- -u`, look at the new pictures, and commit them with the change.
- Keep commits small, and leave the app working after each one. A new dependency needs a reason in the commit message, a license compatible with the GPL, and a run of `npm run notices` so that its license text is shipped.

## How the code is organised

| Folder         | What it holds                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core`     | The domain logic: the project and its manifest, the Typst parser and editing commands, citations, cross-references, the export's styles. Pure TypeScript with unit tests, no Electron, Node or DOM. |
| `src/main`     | The Electron main process: thin adapters that give `core` the file system, the Typst compiler, LanguageTool and the system's dialogs.                                                               |
| `src/preload`  | Only the bridge that hands the renderer the API generated from the IPC contract.                                                                                                                    |
| `src/renderer` | The Svelte app and the CodeMirror editor.                                                                                                                                                           |
| `src/shared`   | The IPC contract: every call between the processes, with its types and schema.                                                                                                                      |

- **The dependency rule.** `core` imports nothing from the other layers. `main` and `renderer` may import `core` and `shared`, never each other. `preload` imports only `shared`. `npm run check:boundaries` enforces it.
- **Ports.** `core` reaches the outside only through the ports in `src/core/ports.ts`, which `main` implements and the tests fake (`src/core/testing/memoryFs.ts`).
- **IPC.** Every call is declared once in `src/shared/ipc.ts` (channel, types, schema), validated in the main process, and reaches the renderer as a typed API. The renderer never gets `ipcRenderer`, Node or Electron.
- **Security.** Context isolation and the sandbox are on, Node integration is off, the Content Security Policy is strict, pages come from the app's own protocol instead of `file://` URLs, and no new windows or navigation are allowed (SPEC 6.6).

## Rules for the product

- **Documents are plain Typst** in a small subset (SPEC 4). The editor draws widgets over the source text; nothing is stored in a hidden format.
- **Never lose the writer's data.** Files are written atomically (a temporary file, then a rename), deleted only to the system trash, and reconciling the manifest with the disk never drops an entry or a file (SPEC 6.5).
- **All visible text goes through the i18n layer**, in German and English, with plural forms where a count is shown.
- **Styling uses the design tokens only**: no colour values, sizes or fonts of their own, spacing on the scale, and buttons as flat fills. Screens are built from the blocks in `src/renderer/ui/kit/`. See [docs/DESIGN.md](docs/DESIGN.md).
- **Content files hold no styling.** How the PDF looks is up to the templates and export profiles (SPEC 7).
- **Spelling and grammar** are checked by LanguageTool running locally as a child process, never by a web service (SPEC 4.7).

The stack, the architecture and the design system are settled; a change to one of them needs a discussion in an issue first.

## Tests

- **Unit tests** (Vitest) sit next to the code as `*.test.ts`. Logic in `core` comes with them.
- **End-to-end tests** (`tests/e2e`) share their helpers in `tests/e2e/helpers.ts` (`launchAt`, `openSheet`, `quietFor`, …). Wait for what happens, never for a fixed time. The tests of a file run on several workers, and the windows are not shown.
- **Golden tests** (`src/main/services/golden.test.ts`, `tests/golden`) pin the look of each bundled template's PDF; they need `EZETTA_TYPST`.
- **Performance** is measured on a generated 95,000-word project (`tests/perf`); the numbers and budgets are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Commands

| Command                                               | What it does                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                         | Start the app with hot reload                                                                                                        |
| `npm run build`                                       | Build main, preload and renderer into `out/`                                                                                         |
| `npm run package`                                     | The macOS app and a dmg in `dist/` (needs `npm run fetch:dev-data`, Typst 0.15.1 and a JDK 17+)                                      |
| `npm run package:mac-x64`                             | The same for Intel Macs, on an Intel Mac (its Typst and JDK must be x64)                                                             |
| `npm run package:linux`                               | The Linux AppImage in `dist/` (on a Mac: set `EZETTA_TYPST` to a Linux Typst binary and `EZETTA_LINUX_JDK` to an unpacked Linux JDK) |
| `npm run package:win`                                 | The Windows installer (NSIS, x64) in `dist/`, on Windows (`EZETTA_JDK` or `JAVA_HOME` names the JDK)                                 |
| `npm test`                                            | Unit tests                                                                                                                           |
| `npm run test:e2e`                                    | Build, then drive the real app with Playwright                                                                                       |
| `npm run check`                                       | Format check, lint, type checks, boundaries, design check and unit tests                                                             |
| `npm run lint`, `npm run format`, `npm run typecheck` | Each check on its own                                                                                                                |
| `npm run check:boundaries`                            | The import rule between the layers                                                                                                   |
| `npm run check:design`                                | The styles keep to the design tokens                                                                                                 |
| `npm run notices`, `npm run check:notices`            | Write `THIRD-PARTY-NOTICES.txt` (the licenses of the libraries and fonts built into the app), or check that it is up to date         |
| `npm run gallery`                                     | The component gallery in the browser (`gallery:app` in the app's own Electron)                                                       |
| `npm run test:gallery`                                | Screenshot tests of the gallery in every theme (`-- -u` writes new pictures)                                                         |
| `npm run bench:core`, `npm run bench:app`             | Timings and memory on a large generated project (`bench:app` needs `npm run build` first)                                            |
| `npm run fetch:dev-data`                              | Download LanguageTool and the thesaurus files into `.dev/`                                                                           |

## Releases

Pushing a tag such as `v0.9.0` (the version in `package.json`, on `main`) runs `.github/workflows/release.yml`. It builds the macOS dmg for Apple Silicon and for Intel, the Linux AppImage and the Windows installer, each on a machine of its own, and attaches them with a `SHA256SUMS.txt` to a draft release. Nothing is published until the maintainer reads the draft and publishes it. Versions below 1.0 are marked as pre-releases.

The release uses the same inputs everywhere: Typst 0.15.1 (the workflow checks each download against its published SHA-256), Temurin 17, and the LanguageTool and thesaurus versions that `npm run fetch:dev-data` pins and checks. To move one of them, change its pin and run the tests.

## License

Ezetta is released under the GPL-3.0-or-later (see [LICENSE](LICENSE)). By contributing you agree that your contribution is released under the same license. The licenses of the software that ships with the app are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
