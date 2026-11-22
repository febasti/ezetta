<script lang="ts">
  import {
    ALL_OF,
    ELEMENTS,
    MODIFIERS,
    PROP_SECTIONS,
    SUB_ELEMENTS,
    propLabel,
    PROPS,
    defaultWord,
    elementById,
    isModifier,
    isShown,
  } from '@core/export/elements'
  import { checkValue } from '@core/export/style'
  import { INHERIT } from '@core/export/custom'
  import { headingNumberingOf } from '@core/export/numbering'
  import { exporting as editor, EXPORT, OPTIONS } from '../export/export.svelte'
  import DocumentField from '../export/DocumentField.svelte'
  import Link from '../../ui/kit/Link.svelte'
  import { elementFont, findFamily, hasItalic, hasWeight } from '@core/export/fonts'
  import type { FontProblem } from '@core/export/fonts'
  import FontPicker from './FontPicker.svelte'
  import ColorField from './ColorField.svelte'
  import LengthField from './LengthField.svelte'
  import ChoiceGlyph from './ChoiceGlyph.svelte'
  import { GLYPHS } from './glyphs'
  import SchematicDrawing from './SchematicDrawing.svelte'
  import {
    EPIGRAPHS,
    DIVIDERS,
    FIGURES,
    HEADINGS,
    LISTS,
    NOTES,
    PARAGRAPHS,
    QUOTES,
    PAGES,
    RUNNING,
    TABLES,
    isAbove,
    lengthCm,
    measureCm,
    panelLayout,
    words,
  } from './schematics'
  import type { Field, Schematic } from './schematics'
  import { numberIn } from '@core/export/template'
  import { fontProblemText } from './fontProblems'
  import type { ElementDef, PropDef } from '@core/export/elements'
  import type { StyleValue } from '@core/export/style'
  import { i18n } from '../../i18n/i18n.svelte'
  import { project } from '../sidebar/project.svelte'
  import Icon from '../../ui/Icon.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import type { IconName } from '../../ui/Icon.svelte'
  import { FIELD_ICONS, TOGGLE_ICONS, panelLines } from './panelLines'
  import type { PanelLine } from './panelLines'
  import Callout from '../../ui/kit/Callout.svelte'
  import ReadonlyNote from './ReadonlyNote.svelte'
  import RunningLine from './RunningLine.svelte'
  import ParagraphSetup from './ParagraphSetup.svelte'
  import HeadingPage from './HeadingPage.svelte'
  import QuotePage from './QuotePage.svelte'
  import ListPage from './ListPage.svelte'
  import PageSetup from './PageSetup.svelte'
  import FigurePage from './FigurePage.svelte'
  import FramePage from './FramePage.svelte'
  import TablePage from './TablePage.svelte'
  import FootnotePage from './FootnotePage.svelte'
  import TypeSpecimen from './TypeSpecimen.svelte'
  import EpigraphPage from './EpigraphPage.svelte'
  import DividerPage from './DividerPage.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Segmented from '../../ui/kit/Segmented.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import TextField from '../../ui/kit/TextField.svelte'

  /**
   * `only` draws the properties of that one element without the panel around them (no title, no
   * other panel), for a panel that holds them among its own (the colours in "Dokument einrichten").
   */
  let { only }: { only?: string } = $props()

  const lang = $derived(i18n.locale)
  const detail = $derived(editor.detail)
  const readOnly = $derived(detail?.builtin ?? true)
  /** The entry chosen, and the elements shown below it (the source of an epigraph, the captions, the parts of the title page). */
  const element = $derived(
    ELEMENTS.find((e) => e.id === (only ?? editor.elementId)) ?? ELEMENTS[0]!,
  )
  const members = $derived<ElementDef[]>([
    element,
    ...(SUB_ELEMENTS[element.id] ?? []).flatMap((id) => elementById(id) ?? []),
  ])
  /**
   * What an element that stands for others ("Alle Überschriften") shows for a modifier: what all
   * of them have, else nothing (they differ). A choice there is set on every one of them.
   */
  const groupValues = $derived<Record<string, Record<string, StyleValue>>>(
    Object.fromEntries(
      Object.entries(ALL_OF).map(([group, ids]) => {
        const values = { ...editor.resolved[group] }
        for (const prop of Object.keys(MODIFIERS)) {
          if (!(prop in values)) continue
          const all = new Set(ids.map((id) => editor.resolved[id]?.[prop] ?? null))
          values[prop] = all.size === 1 ? [...all][0]! : null
        }
        return [group, values]
      }),
    ),
  )
  const valuesOf = (el: ElementDef): Record<string, StyleValue> =>
    groupValues[el.id] ?? editor.resolved[el.id] ?? {}
  /** The families a property can name, with what each has: the compiler's own and the system's. */
  const families = $derived(detail?.families ?? [])
  /** The family an element is set in, as this machine has it (none when it does not). */
  const familyOf = (el: ElementDef) => findFamily(families, elementFont(editor.resolved, el.id))
  /** The family of a part with its own type (the bullets of a list): its own, else the element's. */
  const partFamilyOf = (el: ElementDef, prop: string) => {
    const own = valuesOf(el)[prop]
    return typeof own === 'string' ? findFamily(families, own) : familyOf(el)
  }
  /** The italic of an element: whether its font has one, and whether it asks for one. */
  const italicOf = (el: ElementDef): boolean => valuesOf(el)['italic'] === true
  /** What an element asks of its font that the font does not have, for the property it is about. */
  const problemFor = (el: ElementDef, prop: string): FontProblem | undefined =>
    editor.fontIssues.find(
      (p) =>
        p.element === el.id &&
        ('part' in p && p.part
          ? prop ===
            `${p.part}_${p.kind === 'missing' ? 'font' : p.kind === 'italic' ? 'style' : 'weight'}`
          : p.kind === 'missing' || p.kind === 'emphasis' || p.kind === 'strong'
            ? prop === 'font'
            : p.kind === 'smallcaps'
              ? prop === 'text_case'
              : p.kind === prop),
    )
  /** The parts of an element (its caption, the parts of the title page) opened or closed by the writer. */
  let openParts = $state<Record<string, boolean>>({})
  /** Whether a part shows its settings: as chosen, else open when it is the only part. */
  const partOpen = (part: ElementDef): boolean => openParts[part.id] ?? members.length <= 2
  /** The value whose field is pointed at or has the focus, so its drawing marks it brighter. */
  let hot = $state<{ element: string; prop: string } | null>(null)
  const hotIn = (el: ElementDef): string | null => (hot?.element === el.id ? hot.prop : null)
  /** Where a part stands on the page, for its name: left, centre or right. */
  const partAlign = (el: ElementDef): string | undefined => {
    const a = valuesOf(el)['align']
    return a === 'center' || a === 'right' ? a : a === 'left' ? 'left' : undefined
  }
  /** The fields of a drawing that the element's values let show (the size only for a custom paper). */
  const placedIn = (s: Schematic, values: Readonly<Record<string, unknown>>) =>
    Object.entries(s.places).filter(([, at]) => isShown(at!.prop, values)) as [string, Field][]
  /** Whether the pages face each other (a book), which is when a header can be mirrored. */
  const facing = (_el: ElementDef): boolean => editor.resolved['page']?.['facing'] === 'facing'
  /** The size of the body text's type in centimetres, which an `em` of a heading is counted from. */
  const bodyCm = (): number => lengthCm(editor.resolved['body']?.['size'], 0.39) ?? 0.39
  const showOptions = $derived(!only && editor.elementId === OPTIONS)
  const own = (el: ElementDef, prop: string): boolean =>
    detail?.overrides[el.id]?.[prop] !== undefined
  const explicit = (el: ElementDef, prop: string): boolean =>
    editor.sets[el.id]?.[prop] !== undefined
  /**
   * What a value is taken from when the element does not set it: the nearest element above that
   * does, else the text around it (an element in the text) or the compiler's default.
   */
  function giver(el: ElementDef, prop: string): ElementDef | null {
    for (let at = elementById(el.parent ?? ''); at; at = elementById(at.parent ?? '')) {
      if (explicit(at, prop) || (at.defaults[prop] ?? null) !== null) return at
    }
    return null
  }
  const sourceName = (el: ElementDef, prop: string): string =>
    giver(el, prop)?.[lang] ??
    (IN_TEXT.has(el.id) ? i18n.t('templates.inherit.text') : i18n.t('templates.inherit.default'))
  /**
   * Whether a value can be taken from above: the element has one above it (or stands in the text),
   * and no built-in value of its own, which an unset value would be instead (`resolveStyle`). A
   * modifier (italic, the letter case, a line) is never taken from above: it is on or off.
   */
  const canInherit = (el: ElementDef, prop: string): boolean =>
    (el.parent !== null || IN_TEXT.has(el.id)) &&
    (el.defaults[prop] ?? null) === null &&
    !isModifier(prop)
  /** Whether a value is taken from above now: unset here, and something above gives it. */
  const inheritsNow = (el: ElementDef, prop: string): boolean =>
    !explicit(el, prop) && canInherit(el, prop)
  /** What a label says about its value when pointed at: where it comes from, while it is taken from there. */
  const origin = (el: ElementDef, prop: string): string | undefined =>
    inheritsNow(el, prop)
      ? i18n.t('templates.inheritedFrom', { name: sourceName(el, prop) })
      : undefined
  /** The value an element would take from above if it did not set it: its parent's, as shown. */
  function inheritable(el: ElementDef, prop: string): string | null {
    const value = el.parent ? (editor.resolved[el.parent]?.[prop] ?? null) : null
    if (value === null || value === undefined) return null
    const def = PROPS[prop]!
    if (def.type === 'enum') return def.valueLabels?.[String(value)]?.[lang] ?? String(value)
    if (def.type === 'length' || def.type === 'factor') {
      const text = String(value)
      return lang === 'de' ? text.replace('.', ',') : text
    }
    return String(value)
  }
  /** What the button that takes a value from above again says: the value it brings back, and from where. */
  const revertLabel = (el: ElementDef, prop: string): string => {
    const value = inheritable(el, prop)
    const from = sourceName(el, prop)
    return value === null
      ? i18n.t('templates.revert.plain', { from })
      : i18n.t('templates.revert.value', { value, from })
  }
  /** The values an element's own editor draws (on a page), which are not rows of their own. */
  const drawnIds = (el: ElementDef): string[] => [
    ...(RUNNING[el.id] ?? []),
    ...(NOTES[el.id] ?? []),
    ...(TABLES[el.id] ?? []),
    ...(FIGURES[el.id] ?? []),
    ...(LISTS[el.id] ?? []),
    ...(PAGES[el.id] ?? []),
    ...(EPIGRAPHS[el.id] ?? []),
    ...(DIVIDERS[el.id] ?? []),
    ...(PARAGRAPHS[el.id] ?? []),
    ...(HEADINGS[el.id] ?? []),
    ...(QUOTES[el.id] ?? []),
  ]

  /**
   * The document's own settings that are about an element (they belong to the export, not to the
   * template, and can be changed with a template that comes with the app too): shown on the
   * element's page as well as in "Dokument einrichten", the same control on the same value.
   */
  const DOCUMENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
    page: ['binding'],
    body: ['option:line_height', 'hyphenate'],
    heading_1: ['option:chapter_new_page'],
    title_page: ['option:title_page'],
    contents: ['option:contents'],
    list_of_figures: ['option:list_of_figures'],
    list_of_tables: ['option:list_of_tables'],
    citations: ['citationStyle'],
  }
  /** The template the export uses, whose options the document can change. */
  const exportTemplate = $derived(
    editor.info?.templates.find((t) => t.id === editor.profile?.template),
  )
  /** The document's settings about the element shown, with their names: only options the template offers. */
  const documentFields = $derived(
    (DOCUMENT_FIELDS[element.id] ?? []).flatMap((field) => {
      if (!field.startsWith('option:')) {
        const label =
          field === 'binding'
            ? i18n.t('export.binding')
            : field === 'hyphenate'
              ? i18n.t('export.hyphenate')
              : i18n.t('export.citationStyle')
        return [{ field, label }]
      }
      const option = exportTemplate?.options.find((o) => o.id === field.slice('option:'.length))
      return option && !option.hidden ? [{ field, label: option.label[lang] }] : []
    }),
  )

  /** A typed value: set when it is valid for the property, and marked as refused when it is not. */
  function commit(el: ElementDef, def: PropDef, text: string): void {
    const key = `${el.id}.${def.id}`
    if (text.trim() === '') {
      // An emptied field takes the value from above, whatever the template it was made from sets.
      if (explicit(el, def.id)) void editor.set(el.id, def.id, INHERIT)
      return
    }
    if (checkValue(def, text, el.id !== 'palette') === null) {
      editor.refused = key
      return
    }
    editor.refused = null
    void editor.set(el.id, def.id, def.type === 'text' ? text : text.trim())
  }

  /** The colours of the palette, to show what a colour that names one looks like. */
  const palette = $derived(editor.resolved['palette'] ?? {})
  const field = (event: Event): string => (event.currentTarget as HTMLInputElement).value
  /**
   * The elements in the text that take what they leave unset from the text around them (they have
   * no element above them): an unset value of theirs is "as in the text", not the compiler's own.
   */
  const IN_TEXT = new Set(['quote_inline', 'references', 'citations', 'link', 'highlight'])
  /** What some properties are when unset, whatever the element: no ground, or the look of the text they belong to. */
  const UNSET: Readonly<Record<string, 'none' | 'caption' | 'text'>> = {
    fill: 'none',
    header_fill: 'none',
    stripe_fill: 'none',
    label_font: 'caption',
    label_weight: 'caption',
    label_color: 'caption',
    marker_font: 'text',
    marker_weight: 'text',
    marker_color: 'text',
    number_color: 'text',
  }
  /** What an unset value is called in its field. */
  const unsetText = (el: ElementDef, prop: string): string => {
    const kind = UNSET[prop] ?? (IN_TEXT.has(el.id) ? 'text' : null)
    return kind === 'none'
      ? i18n.t('templates.unset.none')
      : kind === 'caption'
        ? i18n.t('templates.unset.caption')
        : kind === 'text'
          ? i18n.t('templates.unset.text')
          : '—'
  }
  /** The language the document is written in, for the words the PDF prints where none are set. */
  const documentLanguage = $derived(project.snapshot?.language ?? lang)
  /** What an empty text field says: the word the PDF prints instead, or what the field is for. */
  const textPlaceholder = (el: ElementDef, id: string): string =>
    defaultWord(el.id, id, documentLanguage) ??
    (id === 'number_prefix'
      ? i18n.t('templates.affix.before')
      : id === 'number_suffix'
        ? i18n.t('templates.affix.after')
        : unsetText(el, id))
  /** The values of a choice, with a dash first while nothing is chosen. */
  const choices = (
    def: PropDef,
    value: StyleValue | null,
    el: ElementDef,
  ): { value: string; label: string }[] => [
    ...(typeof value === 'string' ? [] : [{ value: '', label: unsetText(el, def.id) }]),
    ...(def.values ?? []).map((v) => ({ value: v, label: def.valueLabels?.[v]?.[lang] ?? v })),
  ]
</script>

{#snippet controlOf(element: ElementDef, id: string)}
  {@const def = PROPS[id]!}
  {@const value = valuesOf(element)[id] ?? null}
  {@const key = `${element.id}.${id}`}
  {@const control = `prop-${element.id}-${id}`}
  {#if id === 'justify'}
    <!-- How the lines are set: ragged or justified, drawn as lines. -->
    <Segmented
      label={propLabel(element.id, def, lang)}
      options={[
        { value: 'ragged', label: i18n.t('templates.setting.ragged') },
        { value: 'justified', label: i18n.t('templates.setting.justified') },
      ]}
      value={value === true ? 'justified' : value === false ? 'ragged' : null}
      named
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v === 'justified')}
    >
      {#snippet glyph(v: string)}
        <ChoiceGlyph prop="justify" value={v} />
      {/snippet}
    </Segmented>
  {:else if def.type === 'bool' && TOGGLE_ICONS[id]}
    {@const family = id === 'italic' ? familyOf(element) : undefined}
    <!-- A switch of the type as its icon, as in a text editor's toolbar. Italic for a font without
         one cannot be chosen; one already chosen can be taken off. -->
    <IconButton
      id={control}
      icon={TOGGLE_ICONS[id]!}
      label={propLabel(element.id, def, lang)}
      pressed={value === true}
      filled
      disabled={readOnly || (family !== undefined && !hasItalic(family) && value !== true)}
      onclick={() => void editor.set(element.id, id, value !== true)}
    />
  {:else if def.type === 'bool'}
    {@const family = id === 'italic' ? familyOf(element) : undefined}
    <!-- Italic for a font without one cannot be chosen; one already chosen can be taken off. -->
    <Checkbox
      id={control}
      label={propLabel(element.id, def, lang)}
      checked={value === true}
      disabled={readOnly || (family !== undefined && !hasItalic(family) && value !== true)}
      onchange={(on) => void editor.set(element.id, id, on)}
    />
  {:else if def.type === 'enum' && (GLYPHS[def.id] || (def.id === 'align' && element.id === 'figure'))}
    <!-- A choice drawn as small pictures: a page upright or across, the rules of a table, where a figure stands (its own pictures: the text's alignment has other ones). -->
    <Segmented
      label={def[lang]}
      options={(def.values ?? []).map((v) => ({
        value: v,
        label: def.valueLabels?.[v]?.[lang] ?? v,
      }))}
      value={typeof value === 'string' ? value : null}
      named
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v)}
    >
      {#snippet glyph(v: string)}
        <ChoiceGlyph prop={def.id === 'align' ? 'figure_align' : def.id} value={v} />
      {/snippet}
    </Segmented>
  {:else if def.type === 'enum' && (def.id === 'align' || def.id === 'cell_align')}
    <Segmented
      label={def[lang]}
      options={(def.values ?? []).map((v) => ({
        value: v,
        label: def.valueLabels?.[v]?.[lang] ?? v,
        icon: `align-${v}` as IconName,
      }))}
      value={typeof value === 'string' ? value : null}
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v)}
    />
  {:else if def.id === 'text_case'}
    {@const family = familyOf(element)}
    <!-- Small caps for a font without them cannot be chosen; ones already chosen can be left. -->
    <Segmented
      label={def[lang]}
      options={(def.values ?? []).map((v) => ({
        value: v,
        label: def.valueLabels?.[v]?.[lang] ?? v,
        sample: v === 'upper' ? 'AA' : 'Aa',
        ...(v === 'smallcaps' ? { sampleStyle: 'smallcaps' as const } : {}),
        disabled: v === 'smallcaps' && family?.smallCaps === 'no' && value !== 'smallcaps',
      }))}
      value={typeof value === 'string' ? value : null}
      named
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v)}
    />
  {:else if def.type === 'enum'}
    {@const family =
      id === 'weight'
        ? familyOf(element)
        : id === 'marker_weight' || id === 'label_weight' || id === 'label_style'
          ? partFamilyOf(element, id === 'marker_weight' ? 'marker_font' : 'label_font')
          : undefined}
    <!-- A weight or an italic the font does not have is shown, greyed: Typst would print another. -->
    <Select
      id={control}
      label={propLabel(element.id, def, lang)}
      value={typeof value === 'string' ? value : ''}
      options={choices(def, value, element).map((choice) => ({
        ...choice,
        disabled:
          family !== undefined &&
          choice.value !== '' &&
          (id === 'label_style'
            ? choice.value === 'italic' && !hasItalic(family) && value !== 'italic'
            : !hasWeight(
                family,
                choice.value,
                id === 'weight' && italicOf(element) && hasItalic(family),
              )),
      }))}
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v)}
    />
  {:else if def.type === 'color'}
    <ColorField
      id={control}
      value={typeof value === 'string' ? value : null}
      {palette}
      label={propLabel(element.id, def, lang)}
      placeholder={unsetText(element, id)}
      tokens={element.id !== 'palette'}
      own={own(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      onset={(v) => void editor.set(element.id, id, v ?? INHERIT)}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else if def.type === 'font'}
    <FontPicker
      id={control}
      value={typeof value === 'string' ? value : ''}
      {families}
      placeholder={unsetText(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else if def.type === 'length'}
    <LengthField
      id={control}
      value={typeof value === 'string' ? value : null}
      label={propLabel(element.id, def, lang)}
      placeholder={unsetText(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else if def.type === 'factor'}
    <!-- A factor (the line spacing): a short number with its arrows, as the lengths have them. -->
    <LengthField
      id={control}
      factor
      value={typeof value === 'string' ? value : null}
      label={propLabel(element.id, def, lang)}
      placeholder={unsetText(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else}
    <TextField
      id={control}
      label={propLabel(element.id, def, lang)}
      value={typeof value === 'string' ? value : ''}
      placeholder={textPlaceholder(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      onchange={(e) => commit(element, def, field(e))}
    />
  {/if}
{/snippet}

{#snippet row(element: ElementDef, id: string, stacked = false)}
  {@const def = PROPS[id]!}
  {@const key = `${element.id}.${id}`}
  {@const control = `prop-${element.id}-${id}`}
  <div
    class="row"
    class:stacked
    class:inherited={inheritsNow(element, id)}
    class:refused={editor.refused === key}
  >
    <label for={control} title={origin(element, id)}>{propLabel(element.id, def, lang)}</label>
    <div class="control" title={origin(element, id)}>
      {@render controlOf(element, id)}
      {@render revertOf(element, id)}
    </div>
    {#if editor.refused === key}
      <p class="invalid" role="alert">{i18n.t('templates.invalid')}</p>
    {/if}
    {#if problemFor(element, id)}
      {@const problem = problemFor(element, id)!}
      <p class="missing">{fontProblemText(problem)}</p>
    {/if}
  </div>
{/snippet}

{#snippet controlHere(element: ElementDef, id: string)}
  <!-- A value where it is set on a drawing: its field, and the button that takes it from above
       again. A switch is a modifier, which is never taken from above, so it has none. -->
  {#if PROPS[id]!.type === 'bool'}
    {@render controlOf(element, id)}
  {:else}
    <span class="with-revert">
      {@render controlOf(element, id)}
      {@render revertOf(element, id)}
    </span>
  {/if}
{/snippet}

{#snippet revertOf(element: ElementDef, id: string)}
  <!-- A value taken from above shows in the quieter tone of an empty field; typing sets it here.
       A value set here has a button after it that takes it from above again, and says what it
       brings back ("Zurück zu 1,4 em („Alle Überschriften“)"). A template that comes with the app
       cannot be changed, so it has none. Its room is kept while the value is taken from above, so
       the field does not move when it comes. -->
  {#if !readOnly && canInherit(element, id)}
    <span class="revert" class:away={!explicit(element, id)}>
      <IconButton
        icon="undo"
        size="sm"
        label={revertLabel(element, id)}
        onclick={() => void editor.set(element.id, id, INHERIT)}
      />
    </span>
  {/if}
{/snippet}

{#snippet together(element: ElementDef, line: PanelLine)}
  <!-- Values that belong together, side by side under one name (the size with the line spacing). -->
  <div
    class="row"
    class:inherited={line.props.every((id) => inheritsNow(element, id))}
    class:refused={line.props.some((id) => editor.refused === `${element.id}.${id}`)}
  >
    <label for="prop-{element.id}-{line.props[0]}" title={origin(element, line.props[0]!)}
      >{line.shared![lang]}</label
    >
    <div class="control together">
      {#each line.props as id (id)}
        <span
          class="part {PROPS[id]!.type}"
          class:glyph={GLYPHS[id] !== undefined}
          class:own={explicit(element, id)}
          class:inherited={inheritsNow(element, id)}
          class:end={id === 'hyphenate'}
          title={origin(element, id)}
        >
          {#if FIELD_ICONS[id]}
            <span class="field-icon" title={propLabel(element.id, PROPS[id]!, lang)}>
              <Icon name={FIELD_ICONS[id]!} size={16} />
            </span>
          {/if}
          {@render controlOf(element, id)}
          {@render revertOf(element, id)}
        </span>
      {/each}
    </div>
    {#if line.props.some((id) => editor.refused === `${element.id}.${id}`)}
      <p class="invalid" role="alert">{i18n.t('templates.invalid')}</p>
    {/if}
    {#each line.props as id (id)}
      {#if problemFor(element, id)}
        <p class="missing">{fontProblemText(problemFor(element, id)!)}</p>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet drawing(element: ElementDef, schematic: Schematic)}
  {@const values = valuesOf(element)}
  {@const placed = placedIn(schematic, values)}
  {@const above = placed.filter(([place]) => isAbove(place))}
  {@const picture = schematic.draw(values).w ?? 128}
  <!-- The choices that change the whole drawing in a row over it, on the same three columns. -->
  {#if above.length > 0}
    <div class="schematic above" style:--picture="{picture}px">
      {#each above as [place, at] (place)}
        {@render placeOf(element, values, place, at)}
      {/each}
    </div>
  {/if}
  <!-- The drawing in the middle, each field on the side its gap is on, close to it, with its short
       name above it. A field beside the drawing is centred on it; its name stands over it. -->
  <div class="schematic" style:--picture="{picture}px">
    <div class="picture">
      <SchematicDrawing drawing={schematic.draw(values)} hot={hotIn(element)} />
    </div>
    {#each placed.filter(([place]) => !isAbove(place)) as [place, at] (place)}
      {@render placeOf(element, values, place, at)}
    {/each}
  </div>
{/snippet}

{#snippet placeOf(
  element: ElementDef,
  values: Readonly<Record<string, unknown>>,
  place: string,
  at: Field,
)}
  {@const key = `${element.id}.${at.prop}`}
  <div
    class="place {place}"
    class:inherited={inheritsNow(element, at.prop)}
    role="group"
    onpointerenter={() => (hot = { element: element.id, prop: at.prop })}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = { element: element.id, prop: at.prop })}
    onfocusout={() => (hot = null)}
  >
    {#if words(at[lang], values) !== ''}
      <label
        class="short"
        for="prop-{element.id}-{at.prop}"
        title={origin(element, at.prop) ?? propLabel(element.id, PROPS[at.prop]!, lang)}
        >{words(at[lang], values)}</label
      >
    {/if}
    {@render controlHere(element, at.prop)}
    {#if editor.refused === key}
      <p class="invalid" role="alert">{i18n.t('templates.invalid')}</p>
    {/if}
  </div>
{/snippet}

{#snippet space(element: ElementDef, id: string)}
  <!-- The space between two parts that stand one under another, set where that space is. -->
  <div class="space" class:inherited={inheritsNow(element, id)}>
    <svg class="span" viewBox="0 0 12 30" width="12" height="30" aria-hidden="true">
      <path d="M2 0.5H10M6 0.5V29.5M2 29.5H10" />
    </svg>
    <span class="space-field">{@render controlHere(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}"
      >{propLabel(element.id, PROPS[id]!, lang)}</label
    >
  </div>
{/snippet}

{#snippet lineLook(element: ElementDef)}
  <!-- What the divider looks like: its values as rows, under its switch on the page. -->
  <div class="rows">
    {#each ['divider_color', 'divider_thickness', 'divider_gap'] as id (id)}
      {@render row(element, id)}
    {/each}
  </div>
{/snippet}

{#snippet runningOptions(element: ElementDef)}
  <!-- What else a header or footer does, as switches. Mirroring is for pages that face each other:
       with single pages it does nothing, so it is not offered. -->
  <div class="rows">
    {#if facing(element)}{@render row(element, 'mirror')}{/if}
    {@render row(element, 'skip_chapter_start')}
  </div>
{/snippet}

{#snippet paragraphOptions(element: ElementDef)}
  <!-- How the lines are set (a choice, drawn) and whether words are divided (a switch): two rows, as
       any other values. -->
  <div class="rows">
    {@render row(element, 'justify')}
    {@render row(element, 'hyphenate')}
    {#if editor.profile?.hyphenate !== undefined}
      <!-- The document's own hyphenation is shown at the top of the page; it is the one that prints. -->
      <p class="short note">{i18n.t('templates.document.hyphenate')}</p>
    {/if}
  </div>
{/snippet}

{#snippet headingLine(element: ElementDef, side: 'above' | 'below')}
  <!-- What a line of the heading looks like: its values as rows, under its switch on the page. -->
  <div class="rows">
    {#each ['color', 'thickness', 'width', 'distance'] as field (field)}
      {@render row(element, `line_${side}_${field}`)}
    {/each}
  </div>
{/snippet}

{#snippet quoteBox(element: ElementDef)}
  <!-- The ground of the quote, and the space inside it on the sides that have no line (a side with
       a line has its own distance). -->
  <div class="rows">
    {@render row(element, 'fill')}
    {@render row(element, 'padding')}
  </div>
{/snippet}

{#snippet quoteLines(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- The sides that have a line, as four switches in one row, and what the lines look like. -->
  <div class="row">
    <span class="label">{i18n.t('templates.quote.lines')}</span>
    <div class="control sides" role="group" aria-label={i18n.t('templates.quote.lines')}>
      {#each ['border_top', 'border_bottom', 'border_left', 'border_right'] as id (id)}
        <Checkbox
          checked={values[id] === true}
          disabled={readOnly}
          onchange={(on) => void editor.set(element.id, id, on)}
          >{propLabel(element.id, PROPS[id]!, lang)}</Checkbox
        >
      {/each}
    </div>
  </div>
  {#if ['border_top', 'border_bottom', 'border_left', 'border_right'].some((side) => values[side] === true)}
    <div class="rows">
      {#each ['border_color', 'border_thickness', 'border_gap'] as id (id)}
        {@render row(element, id)}
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet tableValues(element: ElementDef)}
  <!-- The values of a table that are not a place on its page: its grounds, its bold header, its
       rules, its cells, as rows. -->
  <div class="rows">
    {#each ['header_fill', 'stripe_fill', 'header_bold', 'rule_strong_width', 'rule_width', 'inset'] as id (id)}
      {@render row(element, id)}
    {/each}
  </div>
{/snippet}

{#snippet noteValues(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- The values of the notes that are not a place on their page: in the margin, the column; at the
       foot, the rule above them, with a title of its own as its group had. -->
  {#if values['placement'] === 'margin'}
    <div class="rows">
      {#each ['margin_width', 'margin_gap', 'note_gap'] as id (id)}
        {@render row(element, id)}
      {/each}
    </div>
  {:else}
    <Section
      title={PROP_SECTIONS.find((g) => g.id === 'separator')?.[lang]}
      level={4}
      region={false}
    >
      <div class="rows">
        {#each ['separator_style', 'rule_width', 'rule_length', 'separator_color'].filter( (id) => isShown(id, values) ) as id (id)}
          {@render row(element, id)}
        {/each}
      </div>
    </Section>
  {/if}
{/snippet}

{#snippet sections(element: ElementDef)}
  {@const shape = panelLayout(element)}
  {@const values = valuesOf(element)}
  {#each shape.groups as group (group.id)}
    {@const paragraphs = (PARAGRAPHS[element.id] ?? []).some((id) => group.ids.includes(id))}
    {@const headings = (HEADINGS[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const quotes = (QUOTES[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const quoteFill = (QUOTES[element.id] ?? []).length > 0 && group.id === 'box'}
    {@const quoteBorder = (QUOTES[element.id] ?? []).length > 0 && group.id === 'border'}
    {@const epigraphs = (EPIGRAPHS[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const dividers = (DIVIDERS[element.id] ?? []).length > 0 && group.id === 'divider'}
    {@const lists = (LISTS[element.id] ?? []).length > 0 && group.id === 'list'}
    {@const pageSetup = (PAGES[element.id] ?? []).length > 0 && group.id === 'margins'}
    {@const figurePage = element.id === 'figure' && group.id === 'arrangement'}
    {@const framePage = element.id === 'figure' && group.id === 'frame'}
    {@const tablePage = element.id === 'table' && group.id === 'table'}
    {@const notesPage = (NOTES[element.id] ?? []).length > 0 && group.id === 'placement'}
    {@const custom = drawnIds(element)}
    {@const shown = group.ids.filter((id) => isShown(id, values) && !custom.includes(id))}
    {@const drawn = group.schematics.filter((s) => placedIn(s, values).length > 0)}
    {@const running = !!RUNNING[element.id] && group.ids.some((id) => custom.includes(id))}
    <!-- A group whose properties are all hidden for now (the rule of footnotes in the margin) is left out. -->
    {#if shown.length > 0 || drawn.length > 0 || running || paragraphs || headings || quotes || quoteFill || quoteBorder || epigraphs || dividers || lists || pageSetup || figurePage || framePage || tablePage || notesPage}
      {@const colourOnly =
        group.id === 'type' && group.ids.length === 1 && group.ids[0] === 'color'}
      <!-- A type group with nothing but the colour (a list's text) is the text's colour: no sample of
           a type the element does not set. -->
      <Section
        title={shape.titled
          ? colourOnly
            ? i18n.t('templates.section.text')
            : group[lang]
          : undefined}
        level={4}
        region={false}
      >
        {#if group.id === 'type' && !colourOnly}
          <!-- A line of sample text in the type of the element, as the style resolves it. -->
          <TypeSpecimen {element} resolved={editor.resolved} {palette} />
        {/if}
        <!-- A drawing that is what a group is about (the page) comes first; one that only shows what
             a choice above it leads to (a paper of its own size) comes after the choice. -->
        {#if group.id !== 'format'}
          {#each drawn as schematic, i (i)}
            {@render drawing(element, schematic)}
          {/each}
        {/if}
        {#if notesPage}
          <!-- Footnotes: a page with the notes at its foot or in its margin, each value where it is set. -->
          <FootnotePage
            {element}
            {values}
            control={controlHere}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
          {@render noteValues(element, values)}
        {/if}
        {#if tablePage}
          <!-- A table: a page with the table drawn as the template sets it and its caption, the values under it. -->
          {@const caption = elementById('table_caption')!}
          <TablePage
            {element}
            {caption}
            {values}
            captionValues={valuesOf(caption)}
            control={controlHere}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
          {@render tableValues(element)}
        {/if}
        {#if figurePage}
          <!-- A figure: a page with the figure and its caption between two pieces of text. -->
          {@const caption = elementById('figure_caption')!}
          <FigurePage
            {element}
            {caption}
            {values}
            captionValues={valuesOf(caption)}
            control={controlHere}
            emCm={bodyCm()}
          />
        {/if}
        {#if framePage}
          <!-- The border of an image, around the picture, each value on its side. -->
          <FramePage {element} {values} control={controlHere} emCm={bodyCm()} />
        {/if}
        {#if pageSetup}
          <!-- The page: one or two, with the margins as bands and each value on its side. -->
          <PageSetup
            {element}
            {values}
            binding={editor.profile?.binding ?? null}
            control={controlHere}
          />
        {/if}
        {#if lists}
          <!-- A list: three items between two pieces of text, each value where it is set. -->
          <ListPage {element} {values} control={controlHere} />
        {/if}
        {#if epigraphs}
          <!-- An epigraph: set apart at the right under a chapter's title, each value where it is set. -->
          <EpigraphPage
            {element}
            {values}
            control={controlHere}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
        {/if}
        {#if dividers}
          <!-- A divider: a page with it between two pieces of text, each value where it is set. -->
          <DividerPage
            {element}
            {values}
            control={controlHere}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
        {/if}
        {#if quotes}
          <!-- A block quote: a page with the quote between two pieces of text, each value where it is set. -->
          <QuotePage
            {element}
            {values}
            control={controlHere}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
          <!-- Where the source stands: after the last word, or on a line of its own at the right. -->
          <div class="rows">{@render row(element, 'source_position')}</div>
        {/if}
        {#if quoteFill}{@render quoteBox(element)}{/if}
        {#if quoteBorder}{@render quoteLines(element, values)}{/if}
        {#if headings}
          <!-- A heading: a page with the heading between two pieces of text, each value where it is set. -->
          <HeadingPage
            {element}
            {values}
            control={controlHere}
            refused={editor.refused}
            numbering={headingNumberingOf(editor.resolved)}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
            look={headingLine}
          />
        {/if}
        {#if paragraphs}
          <!-- The body text: two paragraphs, each value where it is set on them. -->
          <ParagraphSetup {element} {values} control={controlHere} />
          {@render paragraphOptions(element)}
        {/if}
        {#if running}
          <!-- A header or a footer: a page with its places, where they are on it. -->
          <RunningLine
            {element}
            {values}
            facing={facing(element)}
            control={controlHere}
            {space}
            look={lineLook}
          />
          {@render runningOptions(element)}
        {/if}
        <div class="rows">
          {#each panelLines(shown) as line (line.props[0])}
            {#if line.shared}
              {@render together(element, line)}
            {:else}
              {@render row(element, line.props[0]!)}
            {/if}
          {/each}
        </div>
        {#if group.id === 'format'}
          {#each drawn as schematic, i (i)}
            {@render drawing(element, schematic)}
          {/each}
        {/if}
      </Section>
    {/if}
  {/each}
  {#each shape.lines.filter( (l) => (l.toggle === 'divider' ? !RUNNING[element.id] : !HEADINGS[element.id]) ) as section (section.toggle)}
    {@const on = values[section.toggle] === true}
    <Section>
      {@render row(element, section.toggle)}
      {#if on && section.toggle === 'divider'}
        <!-- The divider of a header: its values as rows, like the rest of the panel. -->
        <div class="rows">
          {#each section.fields as id (id)}
            {@render row(element, id)}
          {/each}
        </div>
      {:else if on}
        <div class="grid">
          {#each section.fields as id (id)}
            {@render row(element, id, true)}
          {/each}
        </div>
      {/if}
    </Section>
  {/each}
{/snippet}

{#if detail && only}
  <div class="properties">
    {#each members as member (member.id)}
      {@render sections(member)}
    {/each}
  </div>
{:else if detail}
  {#if showOptions}
    <section class="properties" aria-label={i18n.t('templates.options')}>
      <h3 class="title">{i18n.t('templates.options')}</h3>
      {#if readOnly}
        <ReadonlyNote />
      {:else}
        <Callout>{i18n.t('templates.options.help')}</Callout>
      {/if}
      <div class="options">
        <div class="option option-head" aria-hidden="true">
          <span></span>
          <span>{i18n.t('templates.options.default')}</span>
          <span class="offer">{i18n.t('templates.options.offered')}</span>
        </div>
        {#each detail.options as option (option.id)}
          {@const control = `option-${option.id}`}
          <div class="option">
            <label for={control}>{option.label[lang]}</label>
            <div class="control">
              {#if option.type === 'bool'}
                <Checkbox
                  id={control}
                  checked={option.default}
                  disabled={readOnly}
                  onchange={(on) => void editor.setOption(option.id, { default: on })}
                />
              {:else if option.type === 'enum'}
                <Select
                  id={control}
                  value={option.default}
                  options={option.values.map((v) => ({ value: v.id, label: v.label[lang] }))}
                  disabled={readOnly}
                  onchange={(v) => void editor.setOption(option.id, { default: v })}
                />
              {:else}
                <!-- A number in the language's decimal mark, as "Dokument einrichten" shows it. -->
                <TextField
                  id={control}
                  value={option.type === 'number'
                    ? String(option.default).replace('.', lang === 'de' ? ',' : '.')
                    : option.default}
                  placeholder="—"
                  invalid={editor.refused === `option.${option.id}`}
                  disabled={readOnly}
                  onchange={(e) => {
                    // A number is written as the app keeps it (a point); one that is not is refused.
                    const text = field(e)
                    const value =
                      option.type === 'number' ? numberIn(text, option.min, option.max) : text
                    if (value === null) editor.refused = `option.${option.id}`
                    else {
                      editor.refused = null
                      void editor.setOption(option.id, { default: value })
                    }
                  }}
                />
              {/if}
            </div>
            <span class="offer">
              <Checkbox
                checked={!option.hidden}
                label={i18n.t('templates.options.offer')}
                disabled={readOnly}
                onchange={(on) => void editor.setOption(option.id, { hidden: !on })}
              />
            </span>
          </div>
        {/each}
      </div>
    </section>
  {:else}
    <section class="properties" aria-label={element[lang]}>
      <h3 class="title">{element[lang]}</h3>
      {#if documentFields.length > 0}
        <!-- What this document sets about the element, whichever template it uses: a section of
             its own above the template's, as "Dokument einrichten" has them. -->
        <Section title={i18n.t('templates.document.title')} level={4}>
          <p class="short note">
            {i18n.t('templates.document.hint')}
            <Link onclick={() => (editor.elementId = EXPORT)}>{i18n.t('export.panel')}</Link>
          </p>
          <div class="rows document">
            {#each documentFields as { field, label } (field)}
              {@const control = `document-${element.id}-${field.replace(':', '-')}`}
              <div class="row">
                <label for={control}>{label}</label>
                <div class="control">
                  <DocumentField {field} id={control} {label} />
                </div>
              </div>
            {/each}
          </div>
        </Section>
      {/if}
      {#if readOnly}
        <ReadonlyNote />
      {/if}
      {#if element.id === 'page_number'}
        <!-- Where the number stands is a place of the header or the footer, set there. -->
        <p class="short note where">
          {i18n.t('templates.pageNumber.where')}
          <Link onclick={() => (editor.elementId = 'header')}>{elementById('header')?.[lang]}</Link>
          ·
          <Link onclick={() => (editor.elementId = 'footer')}>{elementById('footer')?.[lang]}</Link>
        </p>
      {/if}
      {#each members as member, index (member.id)}
        {@const { gap, head } = panelLayout(member)}
        {@const open = index === 0 || partOpen(member)}
        <!-- A part of the element (a caption, a part of the title page): a line above it, then the
             space above it where there is one, then its name, standing where the part stands on the
             page, with that place beside it. A part opens and closes by its name, so a page of
             many parts stays short. -->
        <div class:member={index > 0}>
          {#if gap && isShown(gap, valuesOf(member))}
            {@render space(member, gap)}
          {/if}
          {#if index > 0}
            <div class="sub-line">
              <h3 class="sub" style:text-align={partAlign(member)}>
                <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a part's name that opens and closes it, a heading with its chevron: the kit has no disclosure -->
                <button
                  type="button"
                  class="disclose"
                  aria-expanded={open}
                  onclick={() => (openParts[member.id] = !open)}
                >
                  <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
                  {member[lang]}
                </button>
              </h3>
              {#if head}{@render controlOf(member, head)}{/if}
            </div>
          {/if}
        </div>
        {#if open}{@render sections(member)}{/if}
      {/each}
    </section>
  {/if}
{/if}

<style>
  .properties {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title {
    margin: 0 0 var(--sp-16);
    color: var(--color-label);
    font: var(--type-title);
  }
  .properties > :global(.callout) {
    margin-bottom: var(--sp-16);
  }
  /* The document's own settings: under their hint. */
  .rows.document {
    margin-top: var(--sp-8);
  }
  /* The part of an element shown under it (the source of an epigraph, a caption). */
  .member {
    margin: var(--sp-16) 0 var(--sp-8);
    padding-top: var(--sp-8);
    border-top: 1px solid var(--color-separator);
  }
  .sub-line {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    margin-top: var(--sp-8);
  }
  .sub {
    flex: 1;
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  /* A part's name opens and closes it: the name with a chevron before it, as wide as it is. */
  .disclose {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    cursor: default;
  }
  .disclose:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .disclose :global(svg) {
    color: var(--color-label-secondary);
  }
  .where {
    margin-bottom: var(--sp-16);
  }
  /* The space between two parts: a span mark, the value, its name, in the middle of the panel. */
  .space {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-8);
    margin: var(--sp-8) 0;
  }
  .space .span path {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 1;
  }
  .space-field {
    display: inline-flex;
    width: auto;
  }
  .space-field :global(.text-field) {
    width: 100%;
  }
  .space.inherited .short {
    color: var(--color-label-tertiary);
  }
  /* Values side by side in one line: the fields as wide as their numbers, a menu the rest. */
  .together {
    gap: var(--sp-4);
  }
  .part {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .part.length {
    width: 84px;
  }
  .part.factor {
    width: 68px;
  }
  .part.factor:has(.field-icon),
  .part.length:has(.field-icon) {
    width: 100px;
  }
  .part :global(.segmented button) {
    padding: 0 var(--sp-8);
  }
  .part.enum {
    flex: 1;
  }
  /* A choice drawn as pictures is as wide as they are. */
  .part.glyph {
    flex: none;
  }
  /* A switch that ends a line stands at its end, its name after it. */
  .part.end {
    margin-left: auto;
  }
  .switch-after :global(.switch) {
    flex-direction: row-reverse;
    gap: var(--sp-8);
  }
  .part :global(.text-field),
  .part :global(.select) {
    width: 100%;
    min-width: 0;
  }
  .field-icon {
    display: inline-flex;
    flex: none;
    color: var(--color-label-tertiary);
  }
  /* A drawing with the fields around it: three columns, the drawing in the middle. */
  .schematic {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--picture, 128px) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: center;
    margin-bottom: var(--sp-12);
  }
  .schematic .picture {
    grid-area: 2 / 2;
  }
  /* A place holds the field, as narrow as its value, against the drawing; its name stands above it,
     aligned with its edge. */
  .place {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    max-width: 96px;
    min-width: 0;
  }
  .place.l,
  .place.tl,
  .place.bl {
    justify-self: end;
  }
  .place.r,
  .place.tr,
  .place.br {
    justify-self: start;
  }
  .place.t,
  .place.b {
    justify-self: center;
    align-items: center;
    max-width: 128px;
  }
  /* Beside the drawing the field is centred on it, so its name stands above without moving it. */
  .place.l .short,
  .place.r .short {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 0;
    white-space: nowrap;
  }
  .place :global(.select) {
    width: 86px;
  }
  .place :global(input.text-field) {
    width: 66px;
  }
  /* A choice in a place is as narrow as its pictures. */
  .place :global(.segmented button) {
    padding: 0 2px;
  }
  .place.t :global(.segmented button),
  .place.b :global(.segmented button) {
    padding: 0 var(--sp-8);
  }
  .place.t {
    grid-area: 1 / 2;
  }
  .place.b {
    grid-area: 3 / 2;
  }
  .place.l {
    grid-area: 2 / 1;
  }
  .place.r {
    grid-area: 2 / 3;
  }
  .place.tl {
    grid-area: 1 / 1;
  }
  .place.tr {
    grid-area: 1 / 3;
  }
  .place.bl {
    grid-area: 3 / 1;
  }
  .place.br {
    grid-area: 3 / 3;
  }
  /* The row over the drawing: one place over each column, against the drawing's edges like the
     fields beside it, the middle one centred; each name centred over its choice. */
  .schematic.above {
    align-items: end;
  }
  .place.a1,
  .place.a2,
  .place.a3 {
    align-items: center;
  }
  .place.a1 {
    grid-area: 1 / 1;
    justify-self: end;
  }
  .place.a2 {
    grid-area: 1 / 2;
    justify-self: center;
  }
  .place.a3 {
    grid-area: 1 / 3;
    justify-self: start;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  /* A value the template takes from the element above it: its name is quieter, as in a row. */
  .place.inherited .short {
    color: var(--color-label-tertiary);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  /* The divider's look in one row: its colour and its two lengths, each with its name above it. */
  /* The setting of the lines takes two thirds of the row, hyphenation the rest. */
  .settings {
    display: flex;
    align-items: stretch;
    gap: var(--sp-8);
  }
  .settings .choice,
  .settings .toggle {
    display: flex;
    min-width: 0;
  }
  .settings .choice {
    flex: 2;
  }
  .settings .toggle {
    flex: 1;
  }
  .settings :global(.cards) {
    flex: 1;
  }
  .line-look {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .line-look .short,
  .caption,
  .note {
    margin: 0;
  }
  .look.wrap {
    flex-wrap: wrap;
    row-gap: var(--sp-8);
  }
  .look {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-12);
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
  }
  /* A property: its name in a column of its own, the control beside it. */
  .row {
    display: grid;
    grid-template-columns: calc(var(--form-label-width) + var(--sp-24)) minmax(0, 1fr);
    gap: var(--sp-4) var(--sp-12);
    align-items: center;
  }
  .row.stacked {
    grid-template-columns: minmax(0, 1fr);
  }
  label {
    min-width: 0;
    color: var(--color-label);
    font: var(--type-body);
  }
  /* A value the template takes from the element above it: its name is quieter. */
  .row.inherited label {
    color: var(--color-label-secondary);
  }
  /* A value taken from above is shown as an empty field shows what applies: in its quieter tone,
     until the field is typed into. */
  .row.inherited > .control :global(:is(input, select):not(:focus)),
  .row.inherited > .control :global(.name),
  .part.inherited :global(:is(input, select):not(:focus)),
  .part.inherited :global(.name),
  .place.inherited :global(:is(input, select):not(:focus)),
  .place.inherited :global(.name),
  .space.inherited :global(:is(input, select):not(:focus)),
  .space.inherited :global(.name) {
    color: var(--color-label-tertiary);
  }
  /* The way back to the value from above: always in sight where a value is set here. */
  .revert {
    display: inline-flex;
    flex: none;
  }
  .revert.away {
    visibility: hidden;
  }
  /* A part of a line with that button is as wide as its field and the button. */
  .part:is(.length, .factor):has(.revert) {
    width: auto;
  }
  .with-revert {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .control {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
  }
  .row > .label {
    color: var(--color-label);
    font: var(--type-body);
  }
  /* The four sides of a quote's lines: switches with their names, side by side. */
  .control.sides {
    flex-wrap: wrap;
    gap: var(--sp-4) var(--sp-12);
  }
  .control > :global(.select),
  .control > :global(.text-field) {
    flex: 1;
  }
  .count {
    display: block;
    min-width: 0;
  }
  .count :global(.text-field) {
    width: 100%;
  }
  .control > .count {
    width: 96px;
  }
  .part .count {
    flex: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-8) var(--sp-12);
  }
  .invalid {
    grid-column: 2;
    margin: 0;
    color: var(--color-danger);
    font: var(--type-caption);
  }
  .stacked .invalid,
  .stacked .missing {
    grid-column: 1;
  }
  /* The options as a table: the name, its default, and whether the export dialog offers it. */
  .option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px 64px;
    gap: var(--sp-8);
    align-items: center;
    padding: var(--sp-8) 0;
  }
  .option + .option {
    border-top: 1px solid var(--color-separator);
  }
  .option-head {
    padding-top: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .offer {
    justify-self: center;
  }
  /* What the font of the element does not have: said under the property, quietly. */
  .missing {
    grid-column: 2;
    margin: 0;
    color: var(--color-warning);
    font: var(--type-caption);
  }
</style>
