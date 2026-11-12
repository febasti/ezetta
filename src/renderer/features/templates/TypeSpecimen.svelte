<script lang="ts">
  import { WEIGHT_NUMBERS, elementById } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { elementFont } from '@core/export/fonts'
  import type { StyleValue } from '@core/export/style'
  import { i18n } from '../../i18n/i18n.svelte'
  import type { MathFont } from '@core/typst/math'

  /**
   * A line of sample text in the type of an element: its family, weight, italic, letter case, letter
   * spacing and colour, as the style resolves them (what the element leaves unset it takes from the
   * element above it). It lies on a piece of paper, since the type is set on paper. The size is not
   * the element's: a sample at a size that suits the panel, since the sizes are in em and mean what
   * they are set against; the pages beside show the sizes as they come. The type of formulas is a
   * formula, drawn by the compiler in the template's math font.
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

  /** The formula the specimen of a math font shows: a fraction, a sum, an integral, Greek letters. */
  const FORMULA = 'integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2, quad sum_(k=1)^n k = (n(n+1))/2'
  const mathFont = $derived<MathFont>(
    resolved['equation']?.['math_font'] === 'libertinus' ? 'libertinus' : 'new_computer_modern',
  )
  const isEquation = $derived(element.id === 'equation')
  let drawing = $state<{ svg: string; width: number; height: number } | null>(null)
  $effect(() => {
    if (!isEquation) return
    const font = mathFont
    let current = true
    void Promise.resolve(window.api?.project.renderMath({ source: FORMULA, display: true, font }))
      .then((result) => {
        if (current && result?.ok && result.value.ok) drawing = result.value
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  })

  /** The compiler's drawing as an element of the page, as the editor puts a formula in. */
  const place = (node: HTMLElement): void => {
    const root = new DOMParser().parseFromString(drawing?.svg ?? '', 'image/svg+xml')
    if (root.documentElement.localName !== 'svg' || root.querySelector('parsererror')) return
    node.replaceChildren(document.importNode(root.documentElement, true))
  }
</script>

{#if isEquation && drawing}
  <div class="paper formula" aria-hidden="true">
    <span
      class="drawing"
      style:width="{drawing.width}em"
      style:height="{drawing.height}em"
      style:color={colour ?? 'inherit'}
      {@attach place}
    >
    </span>
  </div>
{:else}
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
      {@attach place}
    >
      <span class="big">Aa</span>
      {i18n.t('templates.specimen')}
    </p>
  </div>
{/if}

<style>
  /* The paper: white in every theme, the colour the type is set on. */
  .paper {
    padding: var(--sp-12) var(--sp-16);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-md);
    background: var(--color-paper);
    color: var(--color-ink);
  }
  .formula {
    display: flex;
    justify-content: center;
    overflow-x: auto;
  }
  .drawing {
    display: block;
    flex: none;
    font-size: 17px;
  }
  .drawing :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
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
