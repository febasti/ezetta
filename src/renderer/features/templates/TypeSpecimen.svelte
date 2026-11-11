<script lang="ts">
  import { WEIGHT_NUMBERS, elementById } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { elementFont } from '@core/export/fonts'
  import type { StyleValue } from '@core/export/style'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * A line of sample text in the type of an element: its family, weight, italic, letter case, letter
   * spacing and colour, as the style resolves them (what the element leaves unset it takes from the
   * element above it). It lies on a piece of paper, since the type is set on paper. The size is not
   * the element's: a sample at a size that suits the panel, since the sizes are in em and mean what
   * they are set against; the pages beside show the sizes as they come.
   */
  interface Props {
    element: ElementDef
    resolved: Readonly<Record<string, Readonly<Record<string, StyleValue>>>>
    /** The colours of the palette, for a colour that names one. */
    palette: Readonly<Record<string, StyleValue>>
  }
  let { element, resolved, palette }: Props = $props()

  /** A value of the element, or of the nearest element above it that has the property. */
  function inherited(prop: string): StyleValue {
    for (
      let el: ElementDef | undefined = element;
      el;
      el = el.parent ? elementById(el.parent) : undefined
    ) {
      const value = resolved[el.id]?.[prop]
      if (el.props.includes(prop) && value !== null && value !== undefined && value !== '')
        return value
    }
    return null
  }

  const family = $derived(elementFont(resolved as never, element.id))
  const weight = $derived(WEIGHT_NUMBERS[String(inherited('weight'))] ?? 400)
  const italic = $derived(inherited('italic') === true)
  const letterCase = $derived(String(inherited('text_case') ?? 'normal'))
  const spacing = $derived(
    typeof inherited('letter_spacing') === 'string'
      ? String(inherited('letter_spacing'))
      : 'normal',
  )
  const colour = $derived.by(() => {
    const value = inherited('color')
    if (typeof value !== 'string') return null
    return typeof palette[value] === 'string' ? (palette[value] as string) : value
  })
</script>

<div class="paper" aria-hidden="true">
  <p
    class="sample"
    style:font-family="'{family}', var(--font-ui)"
    style:font-weight={weight}
    style:font-style={italic ? 'italic' : 'normal'}
    style:text-transform={letterCase === 'upper' ? 'uppercase' : 'none'}
    style:font-variant-caps={letterCase === 'smallcaps' ? 'small-caps' : 'normal'}
    style:letter-spacing={spacing}
    style:color={colour ?? 'inherit'}
  >
    <span class="big">Aa</span>
    {i18n.t('templates.specimen')}
  </p>
</div>

<style>
  /* The paper: white in every theme, the colour the type is set on. */
  .paper {
    padding: var(--sp-12) var(--sp-16);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-md);
    background: var(--color-paper);
    color: var(--color-ink);
  }
  .sample {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }
  .big {
    margin-right: 0.4em;
    font-size: 28px;
    line-height: 1;
  }
</style>
