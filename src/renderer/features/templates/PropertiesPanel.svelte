<script lang="ts">
  import {
    ALL_OF,
    ELEMENTS,
    MODIFIERS,
    SUB_ELEMENTS,
    propLabel,
    PROPS,
    defaultWord,
    elementById,
    isModifier,
    isShown,
  } from '@core/export/elements'
  import { COLOR_TOKENS, checkValue } from '@core/export/style'
  import { INHERIT } from '@core/export/custom'
  import { headingNumberingOf } from '@core/export/numbering'
  import { exporting as editor, EXPORT, OPTIONS } from '../export/export.svelte'
  import { GROUP_ICONS, OPTIONS_ICON } from '../export/groupIcons'
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
  import { lengthCm, measureCm, panelLayout, placedProps } from './schematics'
  import type { PanelGroup } from './schematics'
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
  /** All values of a section: the rows and what its drawings place, in the element's order. */
  const idsOf = (el: ElementDef, group: PanelGroup): string[] => {
    const mine = new Set([...group.ids, ...group.schematics.flatMap(placedProps)])
    return el.props.filter((id) => mine.has(id))
  }
  /** A length or a factor with the language's decimal mark. */
  const localNumber = (text: string): string => (lang === 'de' ? text.replace('.', ',') : text)
  /** What a value is, in words: null while there is none. A switch has no words. */
  function valueText(el: ElementDef, id: string): string | null {
    const def = PROPS[id]!
    const value = valuesOf(el)[id] ?? null
    if (value === null || value === '' || def.type === 'bool') return null
    if (def.type === 'enum') return def.valueLabels?.[String(value)]?.[lang] ?? String(value)
    if (def.type === 'color')
      return COLOR_TOKENS.find((token) => token.id === value)?.[lang] ?? String(value)
    if (def.type === 'length' || def.type === 'factor')
      return localNumber(String(value)).replace(/^(-?[\d.,]+)([a-z%]+)$/, '$1 $2')
    return String(value)
  }
  /** The values that come first in a section, by section: the choices about the whole before the distances. */
  const FIRST: Readonly<Record<string, readonly string[]>> = {
    arrangement: ['break_before', 'align', 'above', 'below'],
    running: ['slot_left', 'slot_center', 'slot_right', 'distance'],
    table: ['border_style', 'cell_align'],
    list: ['marker', 'enum_format', 'above', 'below', 'list_indent', 'marker_gap', 'level_indent'],
  }
  /** The rows of a section: every value it has that shows for now, the leading ones first. */
  function rowIds(
    el: ElementDef,
    group: PanelGroup,
    values: Readonly<Record<string, unknown>>,
  ): string[] {
    const ids = idsOf(el, group).filter(
      (id) => isShown(id, values) && (id !== 'mirror' || facing(el)),
    )
    const first = (FIRST[group.id] ?? []).filter((id) => ids.includes(id))
    return [...first, ...ids.filter((id) => !first.includes(id))]
  }
  /** The picture a section starts with, by element and section: what its values are about, drawn. */
  const FIGURES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    margins: { page: 'page' },
    arrangement: {
      body: 'paragraph',
      heading: 'heading',
      heading_1: 'heading',
      heading_2: 'heading',
      heading_3: 'heading',
      heading_4: 'heading',
      quote: 'quote',
      epigraph: 'epigraph',
      figure: 'figure',
      table: 'table',
    },
    running: { header: 'running', footer: 'running' },
    list: { list: 'list' },
    divider: { divider: 'divider' },
    placement: { footnote: 'footnote' },
  }
  /** The section a line with a switch (a rule above a heading, the divider of a header) is set in. */
  const LINE_GROUPS: Readonly<Record<string, string>> = {
    line_above: 'arrangement',
    line_below: 'arrangement',
    divider: 'running',
  }
  /**
   * The name of a value in its row, where the element's own is longer than the row needs: the side
   * margins are the inner and the outer one of pages that face each other, else the left and the
   * right one; the distances of a list have the names its picture gives them.
   */
  const rowName = (el: ElementDef, id: string): string =>
    id === 'margin_inside'
      ? i18n.t(facing(el) ? 'templates.margin.inside' : 'templates.margin.left')
      : id === 'margin_outside'
        ? i18n.t(facing(el) ? 'templates.margin.outside' : 'templates.margin.right')
        : el.id === 'list' && id === 'marker_gap'
          ? i18n.t('templates.list.gap')
          : el.id === 'list' && id === 'item_spacing'
            ? i18n.t('templates.list.items')
            : propLabel(el.id, PROPS[id]!, lang)
  /** The four sides of a block quote that can have a line: one row of four switches. */
  const SIDES = ['border_top', 'border_bottom', 'border_left', 'border_right']
  /** Their buttons, in the order they stand in: the sides of the text first, then above and below. */
  const SIDE_BUTTONS = ['border_left', 'border_right', 'border_top', 'border_bottom']
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
      return localNumber(String(value))
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
        return [{ field, label, bool: field === 'hyphenate' }]
      }
      const option = exportTemplate?.options.find((o) => o.id === field.slice('option:'.length))
      return option && !option.hidden
        ? [{ field, label: option.label[lang], bool: option.type === 'bool' }]
        : []
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
      named="beside"
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
      named="beside"
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
      named="beside"
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

{#snippet row(element: ElementDef, id: string, sub = false, name?: string)}
  {@const def = PROPS[id]!}
  {@const key = `${element.id}.${id}`}
  {@const control = `prop-${element.id}-${id}`}
  {@const hover = { element: element.id, prop: id }}
  <!-- Every value is a row: its name, then its control. A switch is a box with its name after it,
       where the controls stand, as in a form of the system. A value that belongs to the switch
       above it (the colour of a line) is set in a little. The row pointed at is marked in the
       picture of its section. -->
  <div
    class="row"
    class:sub
    class:inherited={inheritsNow(element, id)}
    class:refused={editor.refused === key}
    role="group"
    onpointerenter={() => (hot = hover)}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = hover)}
    onfocusout={() => (hot = null)}
  >
    {#if def.type === 'bool' && !TOGGLE_ICONS[id] && id !== 'justify'}
      <span></span>
      <div class="control plain">
        <Checkbox
          id={control}
          checked={valuesOf(element)[id] === true}
          disabled={readOnly}
          onchange={(on) => void editor.set(element.id, id, on)}
          >{name ?? rowName(element, id)}</Checkbox
        >
      </div>
    {:else}
      <label for={control} title={origin(element, id)}>{name ?? rowName(element, id)}</label>
      <div class="control" title={origin(element, id)}>
        <!-- A number takes half of the line, as in a line it shares; anything else all of it. -->
        <span class="cell {def.type}">
          {@render controlOf(element, id)}
          {@render revertOf(element, id, true)}
        </span>
      </div>
    {/if}
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

{#snippet revertOf(element: ElementDef, id: string, place = false)}
  <!-- A value taken from above shows in the quieter tone of an empty field; typing sets it here.
       A value set here has a button after it that takes it from above again, and says what it
       brings back ("Zurück zu 1,4 em („Alle Überschriften“)"). A template that comes with the app
       cannot be changed, so it has none. Its room is kept while the value is taken from above, so
       the field does not move when it comes; in a row (`place`) it is kept for every value, so the
       fields of all rows end on one line. -->
  {#if !readOnly && canInherit(element, id)}
    <span class="revert" class:away={!explicit(element, id)}>
      <IconButton
        icon="undo"
        size="sm"
        label={revertLabel(element, id)}
        onclick={() => void editor.set(element.id, id, INHERIT)}
      />
    </span>
  {:else if place}
    <span class="gutter"></span>
  {/if}
{/snippet}

{#snippet together(element: ElementDef, line: PanelLine)}
  {@const toggles = line.props.some((id) => TOGGLE_ICONS[id] !== undefined)}
  <!-- Values that belong together, side by side under one name (the size with the line spacing):
       two halves of the line, each a field and the place of its way back. A line with switches (the
       weight with italic and underline) is the menu, then the switches, then the menu's way back. -->
  <div
    class="row"
    class:inherited={line.props.every((id) => inheritsNow(element, id))}
    class:refused={line.props.some((id) => editor.refused === `${element.id}.${id}`)}
  >
    <label for="prop-{element.id}-{line.props[0]}" title={origin(element, line.props[0]!)}
      >{line.shared![lang]}</label
    >
    <div class="control together" class:toggles>
      {#each line.props as id (id)}
        <span
          class="part {PROPS[id]!.type}"
          class:glyph={GLYPHS[id] !== undefined}
          class:own={explicit(element, id)}
          class:inherited={inheritsNow(element, id)}
          title={origin(element, id)}
        >
          {#if FIELD_ICONS[id]}
            <span class="field-icon" title={propLabel(element.id, PROPS[id]!, lang)}>
              <Icon name={FIELD_ICONS[id]!} size={16} />
            </span>
          {/if}
          {@render controlOf(element, id)}
          {#if !toggles}{@render revertOf(element, id, true)}{/if}
        </span>
      {/each}
      {#if toggles}
        {#each line.props.filter((id) => PROPS[id]!.type !== 'bool') as id (id)}
          {@render revertOf(element, id, true)}
        {/each}
      {/if}
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

{#snippet tag(element: ElementDef, id: string)}
  <!-- A value in a picture: what it is, in words, where it applies. It is set in its row under the
       picture, which a click on it leads to. A switch has no words: the picture shows what it does. -->
  {#if PROPS[id]!.type !== 'bool'}
    {@const text = valueText(element, id)}
    <label class="tag" class:unset={text === null} for="prop-{element.id}-{id}">{text ?? '–'}</label
    >
  {/if}
{/snippet}

{#snippet space(element: ElementDef, id: string)}
  <!-- The space between two parts that stand one under another, said where that space is. -->
  <div class="space">
    <svg class="span" viewBox="0 0 12 30" width="12" height="30" aria-hidden="true">
      <path d="M2 0.5H10M6 0.5V29.5M2 29.5H10" />
    </svg>
    {@render tag(element, id)}
    <label class="short" for="prop-{element.id}-{id}"
      >{propLabel(element.id, PROPS[id]!, lang)}</label
    >
  </div>
{/snippet}

{#snippet figureOf(element: ElementDef, values: Readonly<Record<string, unknown>>, kind: string)}
  {@const page = editor.resolved['page'] ?? {}}
  {@const emCm = lengthCm(values['size'], bodyCm()) ?? bodyCm()}
  <!-- The picture of a section: the element on its page as the template sets it, its distances
       named where they are. Nothing is set in it; the rows under it are where the values are. -->
  <div class="figure">
    {#if kind === 'page'}
      <PageSetup
        {element}
        {values}
        binding={editor.profile?.binding ?? null}
        control={tag}
        hot={hotIn(element)}
      />
    {:else if kind === 'paragraph'}
      <ParagraphSetup {element} {values} control={tag} />
    {:else if kind === 'heading'}
      <HeadingPage
        {element}
        {values}
        control={tag}
        numbering={headingNumberingOf(editor.resolved)}
        measure={measureCm(page)}
        {emCm}
      />
    {:else if kind === 'quote'}
      <QuotePage {element} {values} control={tag} {emCm} />
    {:else if kind === 'epigraph'}
      <EpigraphPage {element} {values} control={tag} measure={measureCm(page)} {emCm} />
    {:else if kind === 'divider'}
      <DividerPage {element} {values} control={tag} measure={measureCm(page)} {emCm} />
    {:else if kind === 'list'}
      <ListPage {element} control={tag} hot={hotIn(element)} />
    {:else if kind === 'running'}
      <RunningLine {element} {values} facing={facing(element)} control={tag} {space} />
    {:else if kind === 'figure'}
      {@const caption = elementById('figure_caption')!}
      <FigurePage
        {element}
        {caption}
        {values}
        captionValues={valuesOf(caption)}
        control={tag}
        emCm={bodyCm()}
      />
    {:else if kind === 'table'}
      {@const caption = elementById('table_caption')!}
      <TablePage
        {element}
        {caption}
        {values}
        captionValues={valuesOf(caption)}
        control={tag}
        {emCm}
      />
    {:else if kind === 'footnote'}
      <FootnotePage {element} {values} control={tag} measure={measureCm(page)} {emCm} />
    {/if}
  </div>
{/snippet}

{#snippet sides(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- The sides of a block quote that have a line: four buttons in one row, each a picture of its
       side, pressed while that side has a line. -->
  <div class="row">
    <span class="label">{i18n.t('templates.quote.lines')}</span>
    <div class="control plain sides" role="group" aria-label={i18n.t('templates.quote.lines')}>
      {#each SIDE_BUTTONS as id (id)}
        <IconButton
          id="prop-{element.id}-{id}"
          label={propLabel(element.id, PROPS[id]!, lang)}
          pressed={values[id] === true}
          filled
          disabled={readOnly}
          onclick={() => void editor.set(element.id, id, values[id] !== true)}
        >
          {#snippet glyph()}
            <ChoiceGlyph prop="border_side" value={id.replace('border_', '')} />
          {/snippet}
        </IconButton>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet lineRows(
  element: ElementDef,
  values: Readonly<Record<string, unknown>>,
  section: { toggle: string; fields: readonly string[] },
)}
  <!-- A line that a switch turns on (a rule over a heading, the divider of a header): the switch,
       and under it, while it is on, what the line looks like. -->
  {@render row(element, section.toggle)}
  {#if values[section.toggle] === true}
    {#each section.fields as id (id)}
      {@render row(element, id, true, PROPS[id]![lang])}
    {/each}
  {/if}
{/snippet}

{#snippet sections(element: ElementDef)}
  {@const shape = panelLayout(element)}
  {@const values = valuesOf(element)}
  {@const has = (id: string) => shape.groups.some((group) => group.id === id)}
  {#each shape.groups as group (group.id)}
    {@const ids = rowIds(element, group, values)}
    {@const figure = FIGURES[group.id]?.[element.id]}
    {@const lines = shape.lines.filter((line) => LINE_GROUPS[line.toggle] === group.id)}
    {@const drawn = group.schematics.filter((s) =>
      placedProps(s).some((id) => isShown(id, values)),
    )}
    <!-- A section whose values are all hidden for now (the rule of footnotes in the margin) is left out. -->
    {#if ids.length > 0 || figure || lines.length > 0}
      {@const colourOnly = group.id === 'type' && ids.length === 1 && ids[0] === 'color'}
      <!-- A type section with nothing but the colour (a list's text) is the text's colour: no sample of
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
        {#if figure}{@render figureOf(element, values, figure)}{/if}
        {#each drawn as schematic, i (i)}
          <div class="figure plain">
            <SchematicDrawing drawing={schematic.draw(values)} hot={hotIn(element)} />
          </div>
        {/each}
        <div class="rows">
          {#each panelLines(ids) as line (line.props[0])}
            {#if SIDES.includes(line.props[0]!)}
              {#if line.props[0] === SIDES[0]}{@render sides(element, values)}{/if}
            {:else if line.shared}
              {@render together(element, line)}
            {:else}
              {@render row(element, line.props[0]!)}
            {/if}
          {/each}
          {#each lines as section (section.toggle)}
            {@render lineRows(element, values, section)}
          {/each}
        </div>
        {#if ids.includes('hyphenate') && editor.profile?.hyphenate !== undefined}
          <!-- The document's own hyphenation is shown at the top of the page; it is the one that prints. -->
          <p class="short note">{i18n.t('templates.document.hyphenate')}</p>
        {/if}
      </Section>
    {/if}
  {/each}
  <!-- A line of an element that has no section for it: a section of its own. -->
  {#each shape.lines.filter((line) => !has(LINE_GROUPS[line.toggle] ?? '')) as section (section.toggle)}
    <Section>
      <div class="rows">{@render lineRows(element, values, section)}</div>
    </Section>
  {/each}
{/snippet}

{#if detail && only}
  <div class="properties only">
    {#each members as member (member.id)}
      {@render sections(member)}
    {/each}
  </div>
{:else if detail}
  {#if showOptions}
    <section class="properties" aria-label={i18n.t('templates.options')}>
      <header class="head">
        <Icon name={OPTIONS_ICON} size={16} />
        <h3 class="title">{i18n.t('templates.options')}</h3>
      </header>
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
      <header class="head">
        <Icon name={GROUP_ICONS[element.group] ?? 'file'} size={16} />
        <h3 class="title">{element[lang]}</h3>
      </header>
      {#if documentFields.length > 0}
        <!-- What this document sets about the element, whichever template it uses: a section of
             its own above the template's, as "Dokument einrichten" has them. -->
        <Section title={i18n.t('templates.document.title')} level={4}>
          {#snippet action()}
            <Link onclick={() => (editor.elementId = EXPORT)}>{i18n.t('export.panel')}</Link>
          {/snippet}
          <div class="rows">
            {#each documentFields as { field, label, bool } (field)}
              {@const control = `document-${element.id}-${field.replace(':', '-')}`}
              {#if bool}
                <div class="row">
                  <span></span>
                  <div class="control plain document">
                    <DocumentField {field} id={control} named />
                  </div>
                </div>
              {:else}
                <div class="row">
                  <label for={control}>{label}</label>
                  <div class="control plain document">
                    <DocumentField {field} id={control} {label} />
                  </div>
                </div>
              {/if}
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
        {@const spaced = gap !== undefined && isShown(gap, valuesOf(member))}
        <!-- A part of the element (a caption, a part of the title page) is a line of its own under a
             hairline: its name, which opens and closes it, so a page of many parts stays short, and
             at the end of the line the space above the part and where it stands on the page. The
             parts of a page are a list this way, their values in columns. -->
        {#if index === 0}
          {#if spaced}<div class="rows lead">{@render row(member, gap!)}</div>{/if}
        {:else}
          <div class="member">
            <h3 class="sub">
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
            {#if spaced}
              <span
                class="above"
                class:inherited={inheritsNow(member, gap!)}
                title={propLabel(member.id, PROPS[gap!]!, lang)}
              >
                <svg class="span" viewBox="0 0 12 20" width="12" height="20" aria-hidden="true">
                  <path d="M2 0.5H10M6 0.5V19.5M2 19.5H10" />
                </svg>
                {@render controlHere(member, gap!)}
              </span>
            {/if}
            {#if head}{@render controlOf(member, head)}{/if}
          </div>
        {/if}
        {#if open}{@render sections(member)}{/if}
      {/each}
    </section>
  {/if}
{/if}

<style>
  /* The panel keeps a margin at its right, where the buttons stand that take a value from above
     again: the fields, the pictures and the lines between the sections end on one edge, left of it.
     Alone among another panel's sections (`only`), that panel keeps the margin. */
  .properties {
    --names: calc(var(--form-label-width) + var(--sp-32) + var(--sp-8));
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-right: var(--sp-24);
  }
  .properties.only {
    padding-right: 0;
  }
  /* The name of the panel stays in sight while its values scroll under it, a hairline below it. It
     reaches over the margin at the right, so nothing shows beside it. */
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    margin-right: calc(-1 * var(--sp-24));
    padding: 0 var(--sp-24) var(--sp-12) 0;
    background: var(--color-window);
    color: var(--color-label-secondary);
  }
  .head::after {
    content: '';
    position: absolute;
    right: var(--sp-24);
    bottom: 0;
    left: 0;
    border-bottom: 1px solid var(--color-separator);
  }
  .head + :global(*) {
    margin-top: var(--sp-16);
  }
  .title {
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  .properties > :global(.callout) {
    margin-bottom: var(--sp-16);
  }
  /* The space above the element itself, before its sections. */
  .rows.lead {
    margin-bottom: var(--sp-16);
  }
  /* A part of an element shown under it (the source of an epigraph, a caption): a line under a
     hairline, its name first, then the space above it and where it stands. */
  .member {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-height: var(--control-md);
    padding: var(--sp-12) 0;
    border-top: 1px solid var(--color-separator);
  }
  .member + :global(.section) {
    padding-top: var(--sp-4);
  }
  .sub {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  .above {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
  }
  .above .span path,
  .space .span path {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 1;
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
  /* The picture of a section: nothing is set in it, so it is as quiet as a drawing in a book. */
  .figure {
    min-width: 0;
  }
  .figure.plain {
    display: flex;
    justify-content: center;
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  /* A value in a picture: its words, a little stronger than the name beside it. */
  .tag {
    flex: none;
    color: var(--color-label);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }
  .tag.unset {
    color: var(--color-label-tertiary);
    font-weight: 400;
  }
  /* The space between two parts in a picture: a span mark, the value, its name. */
  .space {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-8);
    margin: var(--sp-8) 0;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .note {
    margin: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  /* A value: its name in a column of its own, the control beside it, on every row of the panel. */
  .row {
    display: grid;
    grid-template-columns: var(--names) minmax(0, 1fr);
    gap: var(--sp-4) var(--sp-12);
    align-items: start;
    margin-right: calc(-1 * var(--sp-24));
  }
  /* A name stands at the height of its control, however many lines the name takes. */
  .row > label,
  .row > .label {
    min-width: 0;
    padding-top: calc((var(--control-md) - 18px) / 2);
    color: var(--color-label);
    font: var(--type-body);
  }
  /* What a switch turns on stands under it, set in. */
  .row.sub > label {
    padding-left: var(--sp-16);
    color: var(--color-label-secondary);
  }
  /* A line of controls is two halves. A cell is a field and, after it, the place of the button that
     takes the value from above again: kept for every value, so all fields end on one line. */
  .control {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    align-items: start;
    min-width: 0;
  }
  .cell,
  .part {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    min-height: var(--control-md);
  }
  /* One value has the whole line; a number's field is as wide as half of it, under the numbers of
     the lines above, and its way back stands at the end of the line like every other. */
  .cell {
    grid-column: 1 / -1;
  }
  .cell.length > :global(.length),
  .cell.factor > :global(.length) {
    flex: none;
    width: calc((100% - var(--sp-24) - var(--sp-24) - var(--sp-4)) / 2);
  }
  .cell:not(.length, .factor) > :global(:is(.select, .text-field, .length, .font-picker)),
  .part > :global(:is(.select, .text-field, .length)) {
    flex: 1;
    width: auto;
    min-width: 0;
  }
  .cell > :global(.with-name) {
    flex: 1;
  }
  /* A line with switches: the menu takes what the switches leave. */
  .control.toggles {
    display: flex;
    align-items: center;
  }
  .toggles .part.enum {
    flex: 1;
  }
  /* A choice that shares its line has no room for the name of what is chosen: its tooltip says it. */
  .part :global(.chosen) {
    display: none;
  }
  .part :global(.segmented button) {
    padding: 0 var(--sp-8);
  }
  .field-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    height: var(--control-md);
    color: var(--color-label-tertiary);
  }
  /* A value the template takes from the element above it is a little quieter than one it sets, and
     reads as well: it is what applies. */
  .row.inherited > .control :global(:is(input, select):not(:focus)),
  .row.inherited > .control :global(.name),
  .part.inherited :global(:is(input, select):not(:focus)),
  .part.inherited :global(.name),
  .above.inherited :global(:is(input, select):not(:focus)) {
    color: var(--color-label-secondary);
  }
  /* The way back to the value from above: always in sight where a value is set here. */
  .revert {
    display: inline-flex;
    flex: none;
    align-items: center;
  }
  .revert.away {
    visibility: hidden;
  }
  /* Its place in a row, at the end of the cell and as high as the field. */
  :is(.cell, .part, .toggles) > :is(.revert, .gutter) {
    width: var(--control-sm);
    height: var(--control-md);
    margin-left: auto;
  }
  .gutter {
    flex: none;
  }
  .with-revert {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  /* Controls that are not a field and its way back: side by side. */
  .control.plain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: var(--control-md);
    padding-right: var(--sp-24);
  }
  .control.document > :global(:is(.select, .text-field)) {
    flex: 1;
  }
  /* The four sides of a quote's lines: buttons side by side. */
  .control.sides {
    gap: var(--sp-4);
  }
  .invalid {
    grid-column: 2;
    margin: 0;
    color: var(--color-danger);
    font: var(--type-caption);
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
