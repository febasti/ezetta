<script lang="ts">
  import {
    ELEMENTS,
    SUB_ELEMENTS,
    propLabel,
    PROPS,
    elementById,
    isShown,
  } from '@core/export/elements'
  import { checkValue } from '@core/export/style'
  import { headingNumberingOf } from '@core/export/numbering'
  import { exporting as editor, OPTIONS } from '../export/export.svelte'
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
    HEADINGS,
    PARAGRAPHS,
    QUOTES,
    RUNNING,
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
  import EpigraphPage from './EpigraphPage.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Segmented from '../../ui/kit/Segmented.svelte'
  import Switch from '../../ui/kit/Switch.svelte'
  import ToggleCards from '../../ui/kit/ToggleCards.svelte'
  import ChoiceCards from '../../ui/kit/ChoiceCards.svelte'
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
  const valuesOf = (el: ElementDef): Record<string, StyleValue> => editor.resolved[el.id] ?? {}
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

  /** A typed value: set when it is valid for the property, and marked as refused when it is not. */
  function commit(el: ElementDef, def: PropDef, text: string): void {
    const key = `${el.id}.${def.id}`
    if (text.trim() === '') {
      if (own(el, def.id)) void editor.set(el.id, def.id, null)
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
  /** The values of a choice, with a dash first while nothing is chosen. */
  const choices = (def: PropDef, value: StyleValue | null): { value: string; label: string }[] => [
    ...(typeof value === 'string' ? [] : [{ value: '', label: '—' }]),
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
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v === 'justified')}
    >
      {#snippet glyph(v: string)}
        <ChoiceGlyph prop="justify" value={v} />
      {/snippet}
    </Segmented>
  {:else if id === 'hyphenate'}
    <span class="switch-after">
      <Switch
        checked={value === true}
        disabled={readOnly}
        onchange={(on) => void editor.set(element.id, id, on)}
        >{i18n.t('templates.setting.hyphens')}</Switch
      >
    </span>
  {:else if def.type === 'bool' && TOGGLE_ICONS[id]}
    {@const family = id === 'italic' ? familyOf(element) : undefined}
    <!-- A switch of the type as its icon, as in a text editor's toolbar. Italic for a font without
         one cannot be chosen; one already chosen can be taken off. -->
    <IconButton
      id={control}
      icon={TOGGLE_ICONS[id]!}
      label={propLabel(element.id, def, lang)}
      pressed={value === true}
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
  {:else if def.type === 'enum' && GLYPHS[def.id]}
    <!-- A choice drawn as small pictures: a page upright or across, the rules of a table. -->
    <Segmented
      label={def[lang]}
      options={(def.values ?? []).map((v) => ({
        value: v,
        label: def.valueLabels?.[v]?.[lang] ?? v,
      }))}
      value={typeof value === 'string' ? value : null}
      disabled={readOnly}
      onchange={(v) => void editor.set(element.id, id, v)}
    >
      {#snippet glyph(v: string)}
        <ChoiceGlyph prop={def.id} value={v} />
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
      options={choices(def, value).map((choice) => ({
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
      tokens={element.id !== 'palette'}
      own={own(element, id)}
      invalid={editor.refused === key}
      disabled={readOnly}
      onset={(v) => void editor.set(element.id, id, v)}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else if def.type === 'font'}
    <FontPicker
      id={control}
      value={typeof value === 'string' ? value : ''}
      {families}
      placeholder="—"
      invalid={editor.refused === key}
      disabled={readOnly}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else if def.type === 'length'}
    <LengthField
      id={control}
      value={typeof value === 'string' ? value : null}
      label={propLabel(element.id, def, lang)}
      invalid={editor.refused === key}
      disabled={readOnly}
      oncommit={(text) => commit(element, def, text)}
    />
  {:else}
    <TextField
      id={control}
      label={propLabel(element.id, def, lang)}
      value={typeof value === 'string' ? value : ''}
      placeholder="—"
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
    class:inherited={!explicit(element, id)}
    class:refused={editor.refused === key}
  >
    <label for={control} title={!explicit(element, id) ? i18n.t('templates.inherited') : undefined}
      >{propLabel(element.id, def, lang)}</label
    >
    <div class="control">
      {@render controlOf(element, id)}
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

{#snippet together(element: ElementDef, line: PanelLine)}
  <!-- Values that belong together, side by side under one name (the size with the line spacing). -->
  <div
    class="row"
    class:inherited={line.props.every((id) => !explicit(element, id))}
    class:refused={line.props.some((id) => editor.refused === `${element.id}.${id}`)}
  >
    <label for="prop-{element.id}-{line.props[0]}">{line.shared![lang]}</label>
    <div class="control together">
      {#each line.props as id (id)}
        <span
          class="part {PROPS[id]!.type}"
          class:glyph={GLYPHS[id] !== undefined}
          class:own={explicit(element, id)}
          class:end={id === 'hyphenate'}
        >
          {#if FIELD_ICONS[id]}
            <span class="field-icon" title={propLabel(element.id, PROPS[id]!, lang)}>
              <Icon name={FIELD_ICONS[id]!} size={16} />
            </span>
          {/if}
          {@render controlOf(element, id)}
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
      <!-- The page's drawing also shows the document's binding offset, which is set elsewhere. -->
      <SchematicDrawing
        drawing={schematic.draw(
          element.id === 'page' ? { ...values, binding: editor.profile?.binding ?? null } : values,
        )}
        hot={hotIn(element)}
      />
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
    class:inherited={!explicit(element, at.prop)}
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
        title={propLabel(element.id, PROPS[at.prop]!, lang)}>{words(at[lang], values)}</label
      >
    {/if}
    {@render controlOf(element, at.prop)}
    {#if editor.refused === key}
      <p class="invalid" role="alert">{i18n.t('templates.invalid')}</p>
    {/if}
  </div>
{/snippet}

{#snippet space(element: ElementDef, id: string)}
  <!-- The space between two parts that stand one under another, set where that space is. -->
  <div class="space" class:inherited={!explicit(element, id)}>
    <svg class="span" viewBox="0 0 12 30" width="12" height="30" aria-hidden="true">
      <path d="M2 0.5H10M6 0.5V29.5M2 29.5H10" />
    </svg>
    <span class="space-field">{@render controlOf(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}"
      >{propLabel(element.id, PROPS[id]!, lang)}</label
    >
  </div>
{/snippet}

{#snippet lineLook(element: ElementDef)}
  <!-- What the divider looks like, in one row: each value with its name above it. -->
  <div class="look" role="group" aria-label={i18n.t('templates.running.line')}>
    {#each [['divider_color', i18n.t('templates.running.line.color')], ['divider_thickness', i18n.t('templates.running.line.weight')], ['divider_gap', i18n.t(element.id === 'footer' ? 'templates.running.line.gap.footer' : 'templates.running.line.gap.header')]] as const as [id, caption] (id)}
      <div class="cell">
        <label class="short" for="prop-{element.id}-{id}">{caption}</label>
        <span class="part {PROPS[id]!.type}">{@render controlOf(element, id)}</span>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet runningOptions(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- What else a header or footer does, as cards that are on or off. Mirroring is for pages that
       face each other: with single pages it does nothing, so it is not offered. -->
  <ToggleCards
    label={i18n.t('templates.running.options')}
    disabled={readOnly}
    options={[
      ...(facing(element)
        ? [{ key: 'mirror', icon: 'mirror', label: i18n.t('templates.running.mirror') }]
        : []),
      { key: 'skip_chapter_start', icon: 'eye-off', label: i18n.t('templates.running.skip') },
    ].map((option) => ({
      ...option,
      icon: option.icon as IconName,
      name: propLabel(element.id, PROPS[option.key]!, lang),
      checked: values[option.key] === true,
    }))}
    onchange={(key, on) => void editor.set(element.id, key, on)}
  />
{/snippet}

{#snippet paragraphOptions(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- How the lines are set, ragged or justified, both in view; and whether words are divided. -->
  <div class="settings">
    <div class="choice">
      <ChoiceCards
        fill
        label={i18n.t('templates.paragraphs.lines')}
        value={values['justify'] === true
          ? 'justified'
          : values['justify'] === false
            ? 'ragged'
            : null}
        disabled={readOnly}
        options={[
          { value: 'ragged', label: i18n.t('templates.setting.ragged'), icon: 'align-left' },
          {
            value: 'justified',
            label: i18n.t('templates.setting.justified'),
            icon: 'align-justify',
          },
        ]}
        onchange={(v) => void editor.set(element.id, 'justify', v === 'justified')}
      />
    </div>
    <div class="toggle">
      <ToggleCards
        label={i18n.t('templates.paragraphs.options')}
        disabled={readOnly}
        options={[
          {
            key: 'hyphenate',
            icon: 'hyphenation',
            label: i18n.t('templates.setting.hyphens'),
            name: propLabel(element.id, PROPS['hyphenate']!, lang),
            checked: values['hyphenate'] === true,
          },
        ]}
        onchange={(key, on) => void editor.set(element.id, key, on)}
      />
    </div>
  </div>
{/snippet}

{#snippet headingLines(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- What a line of the heading looks like, there while the line is on. -->
  {#each ['above', 'below'] as side (side)}
    {#if values[`line_${side}`] === true}
      {@const toggle = PROPS[`line_${side}`]!}
      <div class="line-look">
        <p class="short">{propLabel(element.id, toggle, lang)}</p>
        <div class="grid">
          {#each ['color', 'thickness', 'width', 'distance'] as field (field)}
            {@render row(element, `line_${side}_${field}`, true)}
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{/snippet}

{#snippet quoteLooks(element: ElementDef, values: Readonly<Record<string, unknown>>)}
  <!-- The ground of the quote, the sides that have a line, and what the lines look like. -->
  {@render row(element, 'fill')}
  <p class="short caption">{i18n.t('templates.quote.lines')}</p>
  <ToggleCards
    label={i18n.t('templates.quote.lines')}
    disabled={readOnly}
    options={[
      { key: 'border_top', icon: 'border-top' },
      { key: 'border_bottom', icon: 'border-bottom' },
      { key: 'border_left', icon: 'border-left' },
      { key: 'border_right', icon: 'border-right' },
    ].map((option) => ({
      ...option,
      icon: option.icon as IconName,
      label: propLabel(element.id, PROPS[option.key]!, lang),
      name: propLabel(element.id, PROPS[option.key]!, lang),
      checked: values[option.key] === true,
    }))}
    onchange={(key, on) => void editor.set(element.id, key, on)}
  />
  {#if ['border_top', 'border_bottom', 'border_left', 'border_right'].some((side) => values[side] === true)}
    <div class="look" role="group" aria-label={i18n.t('templates.quote.look')}>
      {#each ['border_color', 'border_thickness', 'border_gap'] as id (id)}
        <div class="cell">
          <label class="short" for="prop-{element.id}-{id}"
            >{propLabel(element.id, PROPS[id]!, lang)}</label
          >
          <span class="part {PROPS[id]!.type}">{@render controlOf(element, id)}</span>
        </div>
      {/each}
    </div>
  {/if}
  <!-- The space inside the quote, on the sides that have no line (a side with a line has its own distance). -->
  <div class="look">
    <div class="cell">
      <label class="short" for="prop-{element.id}-padding"
        >{i18n.t('templates.quote.padding')}</label
      >
      <span class="part length">{@render controlOf(element, 'padding')}</span>
    </div>
  </div>
{/snippet}

{#snippet sections(element: ElementDef)}
  {@const shape = panelLayout(element)}
  {@const values = valuesOf(element)}
  {#each shape.groups as group (group.id)}
    {@const paragraphs = (PARAGRAPHS[element.id] ?? []).some((id) => group.ids.includes(id))}
    {@const headings = (HEADINGS[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const quotes = (QUOTES[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const epigraphs = (EPIGRAPHS[element.id] ?? []).length > 0 && group.id === 'arrangement'}
    {@const custom = [
      ...(RUNNING[element.id] ?? []),
      ...(EPIGRAPHS[element.id] ?? []),
      ...(PARAGRAPHS[element.id] ?? []),
      ...(HEADINGS[element.id] ?? []),
      ...(QUOTES[element.id] ?? []),
    ]}
    {@const shown = group.ids.filter((id) => isShown(id, values) && !custom.includes(id))}
    {@const drawn = group.schematics.filter((s) => placedIn(s, values).length > 0)}
    {@const running = !!RUNNING[element.id] && group.ids.some((id) => custom.includes(id))}
    <!-- A group whose properties are all hidden for now (the rule of footnotes in the margin) is left out. -->
    {#if shown.length > 0 || drawn.length > 0 || running || paragraphs || headings || quotes || epigraphs}
      <Section title={shape.titled ? group[lang] : undefined} level={4} region={false}>
        <!-- A drawing that is what a group is about (the page) comes first; one that only shows what
             a choice above it leads to (a paper of its own size) comes after the choice. -->
        {#if group.id !== 'format'}
          {#each drawn as schematic, i (i)}
            {@render drawing(element, schematic)}
          {/each}
        {/if}
        {#if epigraphs}
          <!-- An epigraph: set apart at the right under a chapter's title, each value where it is set. -->
          <EpigraphPage
            {element}
            {values}
            control={controlOf}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
        {/if}
        {#if quotes}
          <!-- A block quote: a page with the quote between two pieces of text, each value where it is set. -->
          <QuotePage
            {element}
            {values}
            control={controlOf}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
          {@render quoteLooks(element, values)}
        {/if}
        {#if headings}
          <!-- A heading: a page with the heading between two pieces of text, each value where it is set. -->
          <HeadingPage
            {element}
            {values}
            control={controlOf}
            refused={editor.refused}
            numbering={headingNumberingOf(editor.resolved)}
            measure={measureCm(editor.resolved['page'] ?? {})}
            emCm={lengthCm(values['size'], bodyCm()) ?? bodyCm()}
          />
          {@render headingLines(element, values)}
        {/if}
        {#if paragraphs}
          <!-- The body text: two paragraphs, each value where it is set on them. -->
          <ParagraphSetup {element} {values} control={controlOf} />
          {@render paragraphOptions(element, values)}
        {/if}
        {#if running}
          <!-- A header or a footer: a page with its places, where they are on it. -->
          <RunningLine {element} {values} facing={facing(element)} control={controlOf} {space} />
          {#if values['divider'] === true}
            {@render lineLook(element)}
          {/if}
          {@render runningOptions(element, values)}
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
                <TextField
                  id={control}
                  value={option.default}
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
      {#if readOnly}
        <ReadonlyNote />
      {/if}
      {#each members as member, index (member.id)}
        {@const { gap, head } = panelLayout(member)}
        <!-- A part of the element (a caption, a part of the title page): a line above it, then the
             space above it where there is one, then its name, standing where the part stands on the
             page, with that place beside it. -->
        <div class:member={index > 0}>
          {#if gap && isShown(gap, valuesOf(member))}
            {@render space(member, gap)}
          {/if}
          {#if index > 0}
            <div class="sub-line">
              <h3 class="sub" style:text-align={partAlign(member)}>{member[lang]}</h3>
              {#if head}{@render controlOf(member, head)}{/if}
            </div>
          {/if}
        </div>
        {@render sections(member)}
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
    width: 96px;
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
  .caption {
    margin: 0;
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
    grid-template-columns: var(--form-label-width) minmax(0, 1fr);
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
  .control {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
  }
  .control > :global(.select),
  .control > :global(.text-field) {
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
