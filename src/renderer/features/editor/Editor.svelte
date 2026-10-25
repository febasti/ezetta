<script lang="ts">
  import { defaultKeymap, history, historyKeymap, redoDepth, undoDepth } from '@codemirror/commands'
  import { syntaxTree } from '@codemirror/language'
  import {
    Annotation,
    Compartment,
    EditorSelection,
    EditorState,
    Prec,
    Transaction,
  } from '@codemirror/state'
  import type { Extension } from '@codemirror/state'
  import { drawSelection, EditorView, keymap } from '@codemirror/view'
  import { citationOverview } from '@core/typst/citations'
  import { blockQuoteWords, inlineQuoteAt, quoteInputRule, quoteMarks } from '@core/typst/quotes'
  import { commentInputRule, formatsAt, paragraphStyleAt, urlAt } from '@core/typst/edit'
  import { onMount } from 'svelte'
  import { figureConfig, figureField } from '../../editor/figureState'
  import { citeConfig, citeField, missingField } from '../../editor/citeState'
  import { refConfig, refField } from '../../editor/refState'
  import { tableConfig, tableField } from '../../editor/tableState'
  import { mathConfig, mathField } from '../../editor/mathState'
  import { quoteConfig, quoteField } from '../../editor/quoteState'
  import { footnoteConfig, footnoteField } from '../../editor/footnoteState'
  import { footnoteMargin } from '../../editor/footnoteMargin'
  import { markupExtension } from '../../editor/markup'
  import { watchScrollbarWidth } from '../../editor/scrollbar'
  import { sourceText } from '../../editor/source'
  import { focusExtension } from '../../editor/focus'
  import { cspNonceExtension, noBrowserProofing, writingTheme } from '../../editor/theme'
  import { typstLanguage } from '../../editor/typst'
  import { i18n } from '../../i18n/i18n.svelte'
  import { call } from '../../lib/api'
  import { markupLabels } from '../../lib/markupLabels'
  import { keybindings } from '../../lib/keybindings.svelte'
  import { proofActive, ui } from '../../lib/ui.svelte'
  import { project } from '../sidebar/project.svelte'
  import { editorKeymap, listKeymap, quoteKeymap } from './editorCommands'
  import { bibliography } from '../bibliography/bibliography.svelte'
  import { tableLabelsFacet, tableToolbar } from './tableToolbar'
  import { citeComplete } from './citeComplete'
  import { proof } from '../proof/proof.svelte'
  import { proofConfig, proofing } from './proofing'
  import { searchExtension } from '../../editor/search'
  import { search } from './search.svelte'
  import { unifyCitationGroups } from './citeGroups'
  import { citeEditor, citeLabelsFacet } from './citeEditor'
  import { crossRefSettings } from './crossRefs'
  import { CAPTION_MARKS, headingNumbering } from '../export/numbering.svelte'
  import { refEditor, refLabelsFacet } from './refEditor'
  import { mathEditor } from './mathEditor'
  import { mathLabels } from './mathLabels'
  import { mathService } from './mathService'
  import { footnoteEditor, mountNoteEditor, noteKeymapFacet } from './footnoteEditor'
  import { mountNoteText } from './noteText'
  import { openEditorContextMenu } from './editorContextMenu'
  import { citeLabels } from './citeLabels'
  import { figureLabels } from './figureLabels'
  import { footnoteLabels } from './footnoteLabels'
  import { quoteLabels } from './quoteLabels'
  import { tableLabels } from './tableLabels'
  import { chooseAndReplace, imageFilesOf, importFiles } from './images'
  import { editor } from './editorSession.svelte'
  import type { EditorHandle } from './editorSession.svelte'

  interface Props {
    initial: string
    label: string
    lang: string
    /** Offset to place the cursor at, when the sheet was opened from the continuous view. */
    cursor?: number
  }
  let { initial, label, lang, cursor }: Props = $props()

  let host = $state<HTMLDivElement>()
  let view: EditorView | undefined
  /** Marks changes that come from outside (a reload), so they are not saved again as edits. */
  const external = Annotation.define<boolean>()
  const markup = new Compartment()
  const notes = new Compartment()
  const figures = new Compartment()
  const tables = new Compartment()
  const quotes = new Compartment()
  const cites = new Compartment()
  const refs = new Compartment()
  const proofC = new Compartment()
  const shortcuts = new Compartment()
  const focus = new Compartment()

  /**
   * Gives `compartment` what `make` returns whenever `key` (the settings it is made from, compared
   * as JSON) changes. Before the editor exists there is nothing to change: it is created with the
   * settings of the moment.
   */
  function reconfigureWhen(compartment: Compartment, key: () => unknown, make: () => Extension) {
    let last: string | undefined
    $effect(() => {
      const next = JSON.stringify(key())
      if (next === last) return
      last = next
      view?.dispatch({ effects: compartment.reconfigure(make()) })
    })
  }

  function focusSettings() {
    return focusExtension({ typewriter: ui.typewriter })
  }

  /** How footnotes are shown and numbered here, from the project and the display setting. */
  function noteSettings() {
    return footnoteConfig.of({
      mode: ui.footnoteMode,
      mountEditor: mountNoteEditor,
      drawText: (target, host, source, wrap, onSize) =>
        mountNoteText(host, target, source, { wrap, onSize }),
      restart: project.snapshot?.footnoteRestart ?? 'continuous',
      offsets: editor.path ? project.footnoteOffsets(editor.path) : { offset: 0, chapterOffset: 0 },
      labels: footnoteLabels(),
      onLayout: ({ layout, left, width }) => {
        editor.setNotesLayout(layout)
        ui.column = layout === 'margin' ? { left, width } : null
      },
    })
  }

  /** How images are numbered and labelled here. The word before the number follows the language of
   * the text (the project's), not of the interface. */
  function figureSettings() {
    return figureConfig.of({
      offset: editor.path ? project.figureOffset(editor.path) : 0,
      supplement: headingNumbering.captionSupplement('fig', project.snapshot?.language ?? 'de'),
      separator: CAPTION_MARKS[headingNumbering.captionSeparator],
      labels: figureLabels(),
      pick: (target, from) => void chooseAndReplace(target, from),
    })
  }

  /** The quotation marks of the project's language, and when a quote is long enough to offer a block. */
  function quoteSettings() {
    return quoteConfig.of({
      marks: quoteMarks(project.snapshot?.language ?? 'de', project.snapshot?.quoteStyle),
      blockFromWords: blockQuoteWords(project.snapshot?.citationStyle ?? ''),
      blockMarks: project.snapshot?.quoteBlockMarks ?? false,
      labels: quoteLabels(),
    })
  }

  /** The bibliography, and the language that words such as "und" and "o. J." come from. */
  function citeSettings() {
    return citeConfig.of({
      lookup: bibliography.lookup,
      all: () => bibliography.entries,
      language: project.snapshot?.language ?? 'de',
      problems: () => bibliography.problems,
      labels: citeLabels(),
    })
  }

  reconfigureWhen(
    cites,
    () => [bibliography.version, project.snapshot?.language, i18n.locale],
    citeSettings,
  )

  /** What cross-references point at: the project's targets, with this sheet's own as typed. */
  function refSettings() {
    return refConfig.of(crossRefSettings({ livePath: editor.path }))
  }

  /** Spelling and grammar: the settings of the project, the dictionaries, and how to ask the checker. */
  function proofSettings() {
    const settings = proof.settings
    return proofConfig.of({
      enabled: proofActive(),
      state: proof.state,
      language: settings.language,
      level: settings.level,
      disabledRules: settings.disabledRules,
      disabledCategories: settings.disabledCategories,
      words: proof.words,
      ignored: proof.ignoredSet(),
      version: proof.version,
      labels: {
        category: {
          spelling: i18n.t('proof.category.spelling'),
          grammar: i18n.t('proof.category.grammar'),
          style: i18n.t('proof.category.style'),
          typography: i18n.t('proof.category.typography'),
        },
        ignore: i18n.t('proof.ignore'),
        disableRule: i18n.t('proof.disableRule'),
        addToProject: i18n.t('proof.addToProject'),
        addToPersonal: i18n.t('proof.addToPersonal'),
        suggestions: i18n.t('proof.suggestions'),
        noSuggestion: i18n.t('proof.noSuggestion'),
        moreActions: i18n.t('proof.moreActions'),
      },
      check: async (units) => {
        const result = await window.api.proof.check({
          language: settings.language,
          level: settings.level,
          disabledRules: [...settings.disabledRules],
          disabledCategories: [],
          units: units.map((unit) => unit.annotation),
        })
        if (!result.ok) return null
        if (!result.value.ok) {
          proof.state = result.value.state
          return null
        }
        return result.value.results
      },
      onIssues: (issues) => editor.setIssues(issues),
      onChecking: (checking) => editor.setProofChecking(checking),
      act: {
        ignore: (issue) => proof.ignore(issue),
        disableRule: (ruleId) => void proof.disableRule(ruleId),
        addWord: (scope, word) => void proof.addWord(scope, word),
      },
    })
  }

  reconfigureWhen(
    proofC,
    () => [
      proofActive(),
      proof.state,
      proof.version,
      proof.settings,
      proof.words.size,
      i18n.locale,
    ],
    () => {
      if (proofActive()) void proof.start()
      return proofSettings()
    },
  )

  reconfigureWhen(
    refs,
    () => [
      project.targetSheets,
      project.snapshot?.language,
      editor.path,
      i18n.locale,
      headingNumbering.current,
      headingNumbering.supplements,
    ],
    refSettings,
  )

  reconfigureWhen(
    quotes,
    () => [
      project.snapshot?.language,
      project.snapshot?.citationStyle,
      project.snapshot?.quoteBlockMarks,
      project.snapshot?.quoteStyle,
      i18n.locale,
    ],
    quoteSettings,
  )

  /** How tables are numbered and labelled here (the word follows the language of the text). */
  function tableSettings() {
    return tableConfig.of({
      offset: editor.path ? project.tableOffset(editor.path) : 0,
      supplement: headingNumbering.captionSupplement('tbl', project.snapshot?.language ?? 'de'),
      separator: CAPTION_MARKS[headingNumbering.captionSeparator],
      labels: tableLabels(),
    })
  }

  reconfigureWhen(
    tables,
    () => [
      project.snapshot?.language,
      editor.path ? project.tableOffset(editor.path) : 0,
      i18n.locale,
      headingNumbering.supplements,
      headingNumbering.captionSeparator,
    ],
    tableSettings,
  )

  reconfigureWhen(
    figures,
    () => [
      project.snapshot?.language,
      editor.path ? project.figureOffset(editor.path) : 0,
      headingNumbering.supplements,
      headingNumbering.captionSeparator,
    ],
    figureSettings,
  )

  reconfigureWhen(
    notes,
    () => [
      ui.footnoteMode,
      project.snapshot?.footnoteRestart,
      editor.path ? project.footnoteOffsets(editor.path) : null,
    ],
    noteSettings,
  )

  // "Show source" switches hiding of syntax on and off without recreating the editor.
  reconfigureWhen(
    markup,
    () => ui.showSource,
    () => markupExtension({ showSource: ui.showSource, labels: markupLabels }),
  )

  reconfigureWhen(focus, () => ui.typewriter, focusSettings)

  // A shortcut the writer sets in the settings applies to the open editor at once.
  reconfigureWhen(
    shortcuts,
    () => keybindings.signature,
    () => keymap.of(editorKeymap()),
  )

  /** Tells the toolbar and the status bar what is at the caret. */
  function syncToolState(target: EditorView): void {
    const { from, to, head } = target.state.selection.main
    const doc = sourceText(target.state)
    const tree = syntaxTree(target.state)
    editor.setParagraph(paragraphStyleAt(tree, doc, head))
    editor.setToolState(
      formatsAt({ doc, tree, from, to }),
      inlineQuoteAt(target.state.field(quoteField), from, to) !== null,
      undoDepth(target.state) > 0,
      redoDepth(target.state) > 0,
    )
  }

  /** Gives the notes panel the sheet's footnotes. */
  /** Tells the list of cited works what the sheet cites, a moment after typing stops. */
  let citationsTimer: ReturnType<typeof setTimeout> | undefined
  function syncCitations(target: EditorView, delay = 300): void {
    clearTimeout(citationsTimer)
    citationsTimer = setTimeout(() => {
      editor.setCitations(citationOverview(target.state.doc.toString(), syntaxTree(target.state)))
    }, delay)
  }

  function syncNotes(target: EditorView): void {
    editor.setNotes(
      target.state.field(footnoteField).map(({ number, text, contentFrom, contentTo }) => ({
        number,
        text,
        source: target.state.sliceDoc(contentFrom, contentTo),
      })),
    )
  }

  onMount(() => {
    const created = new EditorView({
      parent: host!,
      state: EditorState.create({
        doc: initial,
        selection: EditorSelection.cursor(Math.min(cursor ?? 0, initial.length)),
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          // Our shortcuts win over CodeMirror's defaults (for example Mod-i selects the parent syntax node).
          // The keys follow the writer's choices, also while the editor is open.
          Prec.high(shortcuts.of(keymap.of(editorKeymap()))),
          Prec.high(keymap.of(listKeymap())),
          Prec.high(keymap.of(quoteKeymap())),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          typstLanguage.extension,
          markup.of(markupExtension({ showSource: ui.showSource, labels: markupLabels })),
          citeField,
          missingField,
          cites.of(citeSettings()),
          citeEditor,
          citeComplete,
          refField,
          refs.of(refSettings()),
          refEditor,
          proofC.of(proofSettings()),
          proofing,
          searchExtension({ onState: (state) => search.receive(state) }),
          refLabelsFacet.of({
            editor: i18n.t('xref.editor'),
            search: i18n.t('xref.search'),
            empty: i18n.t('xref.empty'),
            none: i18n.t('xref.none'),
            kind: i18n.t('xref.kind'),
            kinds: {
              all: i18n.t('xref.kind.all'),
              sec: i18n.t('xref.kind.sec'),
              fig: i18n.t('xref.kind.fig'),
              tbl: i18n.t('xref.kind.tbl'),
              eq: i18n.t('xref.kind.eq'),
            },
            goTo: i18n.t('xref.goTo'),
            remove: i18n.t('xref.remove'),
            missing: i18n.t('xref.missingNote', { label: '{label}' }),
            excluded: i18n.t('xref.excludedNote', { label: '{label}' }),
            failed: i18n.t('xref.failed'),
          }),
          unifyCitationGroups,
          citeLabelsFacet.of({
            editor: i18n.t('cite.editor'),
            search: i18n.t('cite.pickerPlaceholder'),
            searchMore: i18n.t('cite.searchMore'),
            searchReplace: i18n.t('cite.searchReplace'),
            notFound: i18n.t('cite.notFound'),
            missingRow: i18n.t('cite.pickerMissing'),
            missingRowDetail: i18n.t('cite.pickerMissingDetail'),
            resultsEmpty: i18n.t('cite.pickerEmpty'),
            resultsNone: i18n.t('cite.pickerNone'),
            supplement: i18n.t('cite.supplement'),
            supplementPlaceholder: i18n.t('cite.supplementPlaceholder'),
            supplementInvalid: i18n.t('cite.supplementInvalid'),
            form: i18n.t('cite.form'),
            formGroup: (count) => i18n.t('cite.formGroup', { count }),
            forms: {
              normal: i18n.t('cite.form.normal'),
              prose: i18n.t('cite.form.prose'),
              year: i18n.t('cite.form.year'),
              author: i18n.t('cite.form.author'),
              none: i18n.t('cite.form.none'),
            },
            remove: i18n.t('cite.remove'),
            removeWork: i18n.t('cite.removeWork'),
            check: i18n.t('cite.check'),
            checkNote: i18n.t('cite.checkNoteLabel'),
            checkNotePlaceholder: i18n.t('cite.checkNotePlaceholder'),
            removeChip: i18n.t('cite.removeChip'),
            hintSelect: i18n.t('cite.hintSelect'),
            needed: i18n.t('cite.needed'),
            problems: (count) => i18n.t('cite.pickerProblems', { count }),
          }),
          quoteField,
          quotes.of(quoteSettings()),
          tableField,
          tables.of(tableSettings()),
          tableToolbar,
          tableLabelsFacet.of({
            toolbar: i18n.t('table.toolbar'),
            rowAbove: i18n.t('table.rowAbove'),
            rowBelow: i18n.t('table.rowBelow'),
            columnLeft: i18n.t('table.columnLeft'),
            columnRight: i18n.t('table.columnRight'),
            deleteRow: i18n.t('table.deleteRow'),
            deleteColumn: i18n.t('table.deleteColumn'),
            align: i18n.t('table.align'),
            alignLeft: i18n.t('table.alignLeft'),
            alignCenter: i18n.t('table.alignCenter'),
            alignRight: i18n.t('table.alignRight'),
            header: i18n.t('table.header'),
            caption: i18n.t('table.caption'),
            remove: i18n.t('table.remove'),
          }),
          figures.of(figureSettings()),
          figureField,
          mathField,
          mathConfig.of({ service: mathService, labels: mathLabels() }),
          mathEditor,
          notes.of(noteSettings()),
          footnoteField,
          footnoteMargin,
          footnoteEditor,
          noteKeymapFacet.of(editorKeymap()),
          focus.of(focusSettings()),
          writingTheme,
          ...cspNonceExtension(),
          noBrowserProofing(lang, label),
          // Typing the closing == of ==text== turns it into a comment, and typing the closing
          // quotation mark of a pair turns it into a quote: the file holds no marks of
          // its own. With Quelltext on, what is typed stays as typed.
          EditorView.inputHandler.of((target, from, to, text) => {
            if (from !== to || text.length !== 1 || !'="„“”«»'.includes(text)) return false
            const doc = target.state.doc.toString()
            const tree = syntaxTree(target.state)
            const change =
              text === '='
                ? commentInputRule(doc, from, text, tree)
                : ui.showSource
                  ? null
                  : quoteInputRule(doc, from, text, tree)
            if (!change) return false
            target.dispatch({
              changes: change,
              selection: { anchor: change.from + change.insert.length },
              userEvent: 'input.type',
            })
            return true
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external)))
              editor.edited()
            if (update.docChanged || update.selectionSet) syncToolState(update.view)
            if (update.docChanged) syncCitations(update.view)
            const found = update.state.field(footnoteField)
            if (found !== update.startState.field(footnoteField)) syncNotes(update.view)
          }),
          EditorView.domEventHandlers({
            blur: () => void editor.flushOnBlur(),
            // Pasted and dropped images go into the project's assets folder and become figures.
            paste: (event, target) => {
              const files = imageFilesOf(event.clipboardData)
              if (files.length === 0) return false
              event.preventDefault()
              void importFiles(target, files)
              return true
            },
            dragover: (event) => {
              if (!event.dataTransfer?.types.includes('Files')) return false
              event.preventDefault()
              return true
            },
            drop: (event, target) => {
              const files = imageFilesOf(event.dataTransfer)
              if (files.length === 0) return false
              event.preventDefault()
              const at = target.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined
              void importFiles(target, files, at)
              return true
            },
            contextmenu: (event, target) => {
              openEditorContextMenu(target, event)
              return true
            },
            // Cmd-click (Ctrl-click elsewhere) opens a link in the system browser.
            click: (event, target) => {
              if (!(event.metaKey || event.ctrlKey)) return false
              const pos = target.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos === null) return false
              const url = urlAt({
                doc: target.state.doc.toString(),
                tree: syntaxTree(target.state),
                from: pos,
                to: pos,
              })
              if (!url) return false
              void call(window.api.app.openExternal({ url }))
              return true
            },
          }),
        ],
      }),
    })
    view = created
    const handle: EditorHandle = {
      view: created,
      getContent: () => created.state.doc.toString(),
      setContent: (text) =>
        created.dispatch({
          changes: { from: 0, to: created.state.doc.length, insert: text },
          annotations: [external.of(true), Transaction.addToHistory.of(false)],
        }),
      focus: () => created.focus(),
    }
    editor.attach(handle)
    syncToolState(created)
    syncNotes(created)
    syncCitations(created, 0)
    // A sheet that was just created is being named; the name field keeps the focus.
    if (project.renaming === null) created.focus()
    if (cursor !== undefined) {
      created.dispatch({
        effects: EditorView.scrollIntoView(created.state.selection.main, { y: 'center' }),
      })
    }
    const stopWatching = watchScrollbarWidth(created, (width) => (ui.scrollbarWidth = width))
    return () => {
      editor.setNotes([])
      editor.setIssues([])
      editor.setNotesLayout('none')
      clearTimeout(citationsTimer)
      editor.setCitations(null)
      ui.column = null
      stopWatching()
      editor.detach(handle)
      view = undefined
      created.destroy()
    }
  })
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    min-height: 0;
  }
  .editor > :global(.cm-editor) {
    height: 100%;
  }
</style>
