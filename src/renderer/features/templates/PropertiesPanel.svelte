<script lang="ts">
  import {
    ELEMENTS,
    SUB_ELEMENTS,
    LINE_SECTIONS,
    PROP_SECTIONS,
    PROPS,
    elementById,
    isShown,
  } from '@core/export/elements'
  import { COLOR_TOKENS, checkValue, isColorToken } from '@core/export/style'
  import { exporting as editor, OPTIONS } from '../export/export.svelte'
  import { elementFont, findFamily, hasItalic, hasWeight } from '@core/export/fonts'
  import type { FontProblem } from '@core/export/fonts'
  import FontPicker from './FontPicker.svelte'
  import { numberIn } from '@core/export/template'
  import { fontProblemText } from './fontProblems'
  import type { ElementDef, PropDef } from '@core/export/elements'
  import type { StyleValue } from '@core/export/style'
  import { i18n } from '../../i18n/i18n.svelte'
  import type { IconName } from '../../ui/Icon.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
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
  const valuesOf = (el: ElementDef): Record<string, StyleValue> => editor.resolved[el.id] ?? {}
  /** The families a property can name, with what each has: the compiler's own and the system's. */
  const families = $derived(detail?.families ?? [])
  /** The family an element is set in, as this machine has it (none when it does not). */
  const familyOf = (el: ElementDef) => findFamily(families, elementFont(editor.resolved, el.id))
  /** The italic of an element: whether its font has one, and whether it asks for one. */
  const italicOf = (el: ElementDef): boolean => valuesOf(el)['italic'] === true
  /** What an element asks of its font that the font does not have, for the property it is about. */
  const problemFor = (el: ElementDef, prop: string): FontProblem | undefined =>
    editor.fontIssues.find(
      (p) =>
        p.element === el.id &&
        (p.kind === 'missing' || p.kind === 'emphasis' || p.kind === 'strong'
          ? prop === 'font'
          : p.kind === 'smallcaps'
            ? prop === 'text_case'
            : p.kind === prop),
    )
  /** The properties of the lines of a heading, which are drawn as a group of their own. */
  const LINE_IDS = new Set(LINE_SECTIONS.flatMap((section) => [section.toggle, ...section.fields]))
  /** The properties of an element in groups; the lines of a heading are groups of their own. */
  function layout(el: ElementDef): {
    groups: { id: string; de: string; en: string; ids: string[] }[]
    lines: (typeof LINE_SECTIONS)[number][]
    titled: boolean
  } {
    const plain = el.props.filter((id) => !LINE_IDS.has(id))
    const used: string[] = []
    const groups: { id: string; de: string; en: string; ids: string[] }[] = []
    for (const section of PROP_SECTIONS) {
      if (section.only && !section.only.includes(el.id)) continue
      // A property is in the first section that has it, so one used by two kinds of element (the
      // weight of a rule) is drawn once.
      const ids = plain.filter((id) => section.props.includes(id) && !used.includes(id))
      used.push(...ids)
      if (ids.length > 0) groups.push({ ...section, ids })
    }
    const rest = plain.filter((id) => !used.includes(id))
    if (rest.length > 0) groups.push({ id: 'other', de: 'Weiteres', en: 'Other', ids: rest })
    const lines = LINE_SECTIONS.filter((section) => el.props.includes(section.toggle))
    // Titles over the groups only help when there is more than one group.
    return { groups, lines, titled: groups.length + lines.length > 1 }
  }
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
  const swatch = (value: unknown): string => {
    const hex = isColorToken(value) ? palette[value] : value
    return typeof hex === 'string' && /^#[0-9a-f]{6}/i.test(hex) ? hex.slice(0, 7) : '#000000'
  }
</script>

{#snippet row(element: ElementDef, id: string, stacked = false)}
  {@const def = PROPS[id]!}
  {@const value = valuesOf(element)[id] ?? null}
  {@const key = `${element.id}.${id}`}
  {@const control = `prop-${element.id}-${id}`}
  <div
    class="row"
    class:stacked
    class:inherited={!explicit(element, id)}
    class:refused={editor.refused === key}
  >
    <label for={control} title={!explicit(element, id) ? i18n.t('templates.inherited') : undefined}
      >{def[lang]}</label
    >
    <div class="control">
      {#if def.type === 'bool'}
        {@const family = id === 'italic' ? familyOf(element) : undefined}
        <!-- Italic for a font without one cannot be chosen; one already chosen can be taken off. -->
        <Checkbox
          id={control}
          checked={value === true}
          disabled={readOnly || (family !== undefined && !hasItalic(family) && value !== true)}
          onchange={(on) => void editor.set(element.id, id, on)}
        />
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
      {:else if def.id === 'orientation'}
        <Segmented
          label={def[lang]}
          options={(def.values ?? []).map((v) => ({
            value: v,
            label: def.valueLabels?.[v]?.[lang] ?? v,
          }))}
          value={typeof value === 'string' ? value : null}
          disabled={readOnly}
          onchange={(v) => void editor.set(element.id, id, v)}
        />
      {:else if def.id === 'text_case' || def.id === 'columns'}
        {@const family = id === 'text_case' ? familyOf(element) : undefined}
        <!-- Small caps for a font without them cannot be chosen; ones already chosen can be left. -->
        <Segmented
          label={def[lang]}
          options={(def.values ?? []).map((v) => ({
            value: v,
            label: def.valueLabels?.[v]?.[lang] ?? v,
            sample: def.id === 'columns' ? v : v === 'upper' ? 'AA' : 'Aa',
            ...(v === 'smallcaps' ? { sampleStyle: 'smallcaps' as const } : {}),
            disabled: v === 'smallcaps' && family?.smallCaps === 'no' && value !== 'smallcaps',
          }))}
          value={typeof value === 'string' ? value : null}
          disabled={readOnly}
          onchange={(v) => void editor.set(element.id, id, v)}
        />
      {:else if def.type === 'enum'}
        {@const family = id === 'weight' ? familyOf(element) : undefined}
        <!-- A weight the font does not have is shown, greyed: Typst would print another. -->
        <Select
          id={control}
          value={typeof value === 'string' ? value : ''}
          options={choices(def, value).map((choice) => ({
            ...choice,
            disabled:
              family !== undefined &&
              choice.value !== '' &&
              !hasWeight(family, choice.value, italicOf(element) && hasItalic(family)),
          }))}
          disabled={readOnly}
          onchange={(v) => void editor.set(element.id, id, v)}
        />
      {:else if def.type === 'color'}
        <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the system’s colour well -->
        <input
          class="swatch"
          class:unset={value === null}
          type="color"
          aria-label={def[lang]}
          value={swatch(value)}
          disabled={readOnly}
          onchange={(e) => commit(element, def, e.currentTarget.value)}
        />
        <TextField
          id={control}
          value={typeof value === 'string' ? value : ''}
          placeholder="—"
          invalid={editor.refused === key}
          disabled={readOnly}
          onchange={(e) => commit(element, def, field(e))}
        />
        {#if element.id !== 'palette'}
          <!-- The colours of the palette are small dots: one click names the colour, another takes it back to a colour of its own. -->
          <span class="tones" role="group" aria-label={i18n.t('templates.palette')}>
            {#each COLOR_TOKENS as token (token.id)}
              {@const on = value === token.id}
              <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a colour of the palette, as a dot -->
              <button
                type="button"
                class="tone"
                class:on
                aria-pressed={on}
                aria-label={token[lang]}
                title={token[lang]}
                style:background={swatch(token.id)}
                disabled={readOnly}
                onclick={() => void editor.set(element.id, id, on ? swatch(value) : token.id)}
              ></button>
            {/each}
          </span>
        {/if}
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
      {:else}
        <TextField
          id={control}
          value={typeof value === 'string' ? value : ''}
          placeholder="—"
          invalid={editor.refused === key}
          disabled={readOnly}
          onchange={(e) => commit(element, def, field(e))}
        />
      {/if}
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

{#snippet sections(element: ElementDef)}
  {@const shape = layout(element)}
  {@const values = valuesOf(element)}
  {#each shape.groups as group (group.id)}
    {@const shown = group.ids.filter((id) => isShown(id, values))}
    <!-- A group whose properties are all hidden for now (the rule of footnotes in the margin) is left out. -->
    {#if shown.length > 0}
      <Section title={shape.titled ? group[lang] : undefined} level={4} region={false}>
        <div class="rows">
          {#each shown as id (id)}
            {@render row(element, id)}
          {/each}
        </div>
      </Section>
    {/if}
  {/each}
  {#each shape.lines as section (section.toggle)}
    {@const on = values[section.toggle] === true}
    <Section>
      {@render row(element, section.toggle)}
      {#if on}
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
      <Callout>
        {readOnly ? i18n.t('templates.readonly') : i18n.t('templates.options.help')}
      </Callout>
      {#each detail.options as option (option.id)}
        {@const control = `option-${option.id}`}
        <div class="option">
          <div class="row">
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
          </div>
          <span class="offer">
            <Checkbox
              checked={!option.hidden}
              disabled={readOnly}
              onchange={(on) => void editor.setOption(option.id, { hidden: !on })}
            >
              {i18n.t('templates.options.offer')}
            </Checkbox>
          </span>
        </div>
      {/each}
    </section>
  {:else}
    <section class="properties" aria-label={element[lang]}>
      <h3 class="title">{element[lang]}</h3>
      {#if readOnly}
        <Callout>{i18n.t('templates.readonly')}</Callout>
      {/if}
      {#each members as member, index (member.id)}
        {#if index > 0}<h3 class="sub">{member[lang]}</h3>{/if}
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
  .sub {
    margin: var(--sp-16) 0 var(--sp-8);
    padding-top: var(--sp-16);
    border-top: 1px solid var(--color-separator);
    color: var(--color-label);
    font: var(--type-title);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
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
  .tones {
    display: inline-flex;
    flex: none;
    gap: var(--sp-4);
    margin-left: var(--sp-4);
  }
  /* A colour of the palette, as a dot in its own colour. */
  .tone {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--color-field-border);
    border-radius: 50%;
    cursor: default;
  }
  .tone.on {
    box-shadow:
      0 0 0 2px var(--color-window),
      0 0 0 4px var(--color-accent);
  }
  .tone:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .swatch {
    flex: none;
    width: var(--control-md);
    height: var(--control-md);
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
  }
  /* A colour that is not set shows a faint square, not a black one. */
  .swatch.unset {
    opacity: 0.25;
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
  .option {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-12) 0;
  }
  .option + .option {
    border-top: 1px solid var(--color-separator);
  }
  .offer {
    margin-left: calc(var(--form-label-width) + var(--sp-12));
  }
  /* What the font of the element does not have: said under the property, quietly. */
  .missing {
    grid-column: 2;
    margin: 0;
    color: var(--color-warning);
    font: var(--type-caption);
  }
</style>
