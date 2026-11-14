# Performance and memory

How fast the editor is and what it costs in memory, measured on a large project, with the numbers
of the last full run and the budgets we hold ourselves to. Measured on an M-series Mac (10 cores,
32 GB), Electron 44.

## How to measure

```
npm run build && npm run bench:app     # the running app: start, memory, typing, scrolling (about 4 min)
npm run bench:core                     # the core and the main-process services (about 10 s)
npm run bench:history                  # a simulated year of versions (about 4 min)
```

Both generate their project (`tests/perf/fixture.ts`): 160 sheets and about 95,000 words in 8
groups, with headings, citations, footnotes, formulas, quotes, figures, tables and cross-references,
a bibliography of 300 works and 24 images; also a project five times as large (800 sheets, 480,000
words), one sheet of 20,000 words, and a dense one of 8,000 words with every kind of widget. Nothing
here touches real files. `bench:app` writes `tests/perf/report.json` for comparing runs. Memory is
the resident size of every process of the app (`ps`), the Java processes included.

## The numbers (large project, 95,000 words)

| What                                                 | Result                                                               | Budget                        |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Launch to the first row of the tree                  | 0.58 s (800 sheets: 0.97 s)                                          | under 2 s                     |
| Open a sheet                                         | 90 ms (20,000-word sheet: 70 ms; dense: 100 ms)                      | under 200 ms                  |
| Switch to another sheet                              | 38 ms median, 56 ms worst                                            | under 100 ms                  |
| Continuous view of all 95,000 words                  | 0.25 s (480,000 words: 1.4 s)                                        | under 2 s                     |
| Key press to the next frame                          | 25 ms median, 33 ms 95th percentile (the floor is two frames, 33 ms) | no long task (50 ms)          |
| Main-thread work per key press                       | 3 ms; 20,000-word sheet 4.6 ms; dense 8,000 words 6.8 ms             | under 8 ms (half a frame)     |
| Scrolling                                            | 60 frames a second, a few frames of 21 to 26 ms                      | no frame over 33 ms           |
| Paste 300 KB (40,000 words)                          | 0.4 s; select all, delete, undo: 35 ms each                          | under 1 s                     |
| 60 sheets changed on disk at once                    | settled in under 1.5 s                                               | under 3 s                     |
| A version of the project (unchanged / one file)      | 26 / 26 ms; first one 120 ms                                         | under 100 ms, first under 1 s |
| The same with 300 MB of images                       | unchanged 0.2 s; first one 0.6 s                                     | under 1 s                     |
| A year of versions (5,259), the store                | 126 files, 26 MB (before packing: 29,560 files, 124 MB on disk)      | a few hundred files           |
| Listing all versions after a year                    | 0.47 s                                                               | under 1 s                     |
| A backup of the project (zip)                        | 0.15 s; with 300 MB of images 1.0 s                                  | under 5 s                     |
| Memory, project open, no sheet                       | 510 MB in total                                                      | under 600 MB                  |
| Memory, a sheet open                                 | 540 MB                                                               | under 600 MB                  |
| Memory, 800 sheets, continuous view of 480,000 words | 810 MB                                                               | under 1 GB                    |
| Memory, the spelling checker running                 | +570 MB (Java), then 0 when idle                                     | none when idle                |

Where the memory goes: an empty Electron window with nothing in it is 370 MB on this machine
(main 158, renderer 89, GPU 75, utility 49). The app adds about 70 MB at the welcome screen and
about 150 MB with a project and a sheet open. The JavaScript heap of the renderer is 9 MB. The one
big thing is the Java process of LanguageTool.

## What was found, and done

- **The checker's Java was the largest user of memory** (760 MB, and it kept growing to about
  990 MB with the default flags). Three changes: it is **stopped after three idle minutes** and
  started again by the next check (about a second; to everyone else it stays "ready"); it runs with
  flags that make it give memory back (periodic collection, tighter free ratios, small stacks and
  code cache): about 700 MB instead of 990 MB at the same speed. A smaller heap was tried and
  rejected: 512 MB made every request two to three times slower, 384 MB ran out of memory.
- **The morphology helper** (a second Java process for synonyms) stayed for the whole session. It
  is now stopped after three idle minutes too, with the same flags. Testing this found a bug: after
  the helper had died (a crash), the next question was sent to the dead process and timed out.
- **The project snapshot** (131 KB of nested data for 160 sheets, replaced on every autosave) was
  deeply reactive; it is now `$state.raw`, so nothing is proxied.
- **Versions and backups with large images.** The first version of 300 MB of images took 5.9 s and
  held the main process (git objects were compressed in JavaScript): now 0.6 s (native zlib off the
  main thread, and an image is not compressed again). A backup of them took 11.4 s: now 1.0 s, as
  images and stored git objects go into the zip as they are.
- **A year of versions** (`bench:history`: 44 weeks of drafting and revising, four hours a day, a
  version every ten minutes, exports, a photo every other week) left 29,560 loose git objects:
  25 MB of data but 124 MB on disk, as each small file takes a block, and tens of thousands of files
  are slow to sync, copy and back up. The store is now **packed** as versions are taken: loose
  objects go into a pack once there are 256, and the packs are merged into one once there are more
  than eight. The store stays under a few hundred files all year (26 MB). The packs are written
  with Node's zlib and SHA-1, not by `isomorphic-git`, whose packing compresses in JavaScript and
  would hold the main process; each pack is read back object by object before anything is removed.
  Objects over 512 KB (photos) stay loose, because `isomorphic-git` reads a whole pack into memory
  to read one object of it; the packs it has read are kept between calls. A store from before
  packing (30,000 files) is packed by its next version in about 2 to 10 s. A backup holds the store,
  so no packing removes files while one runs. The version dialog showed only the newest 200 versions
  (about a week); it now lists all of them, with each day opening and closing.
- **Typing, scrolling and switching are at the display's limit** and were left alone. The per-key
  cost is mostly the parser (0.6 ms of 6 ms in the dense sheet) and the decorations; the cost grows
  with the size of the one sheet being edited, not with the project.
- **Investigated, nothing to do:** a focused text field makes the GPU process wake up about 70
  times a second. A plain `<input>` without any of our code does the same, so it is Chromium's, not
  the editor's (a CSS-free caret blink was tried and made no difference, and was removed). No
  animation runs otherwise; an idle app uses 0.1 % CPU.
- **Investigated, nothing to do:** after every autosave the watcher sees the file, and the project
  is scanned again and its tree rebuilt and compared: 2 ms in all on the large project (the tree
  itself 0.3 ms), so it was left as it is, simple and always right.
- **Investigated, nothing to do:** the renderer is one script of 1.1 MB. Chromium parses it in
  about 3 ms and compiles what runs in about 3 ms more (a trace of a reload, the editor ready after
  48 ms), since functions are compiled only when first called. Loading the template editor and the
  version dialog on demand would save a millisecond or two of a 0.58 s start, and give both a
  loading state and a way to fail; the script stays one file.
- **Memory over time:** the renderer's resident size grows by about 70 MB over the first hundred
  sheet switches and then stays level (50 switches at a time, seven rounds); the JavaScript heap
  grows by 2 KB a switch (10.4 MB to 11.3 MB over 350), which is not worth chasing.

## Not done, and why

- The sidebar is not virtualised: 800 sheets are 841 rows in the DOM and still open in 1 s. A book
  of several thousand sheets would want it.
- The decorations are rebuilt for the whole sheet on a key press, not only the visible part. A
  single sheet of 20,000 dense words costs about 15 ms a key; the usual sheet is 1 to 3 ms.
- Packs have no deltas: git's own `git repack` would make a year's store 12 MB instead of 26 MB,
  but `isomorphic-git` cannot write deltas. Old automatic versions are not thinned out either: it
  would halve the store and is not worth losing versions for.
- The backup includes the version history, so a project with 300 MB of images backs up 600 MB.
  Leaving the images' versions out of the zip would halve it but make a restore from a backup lose
  the history of the images.
