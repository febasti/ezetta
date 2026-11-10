<script lang="ts">
  import { COLOR_TOKENS, isColorToken } from '@core/export/style'
  import { i18n } from '../../i18n/i18n.svelte'
  import Popover from '../../ui/kit/Popover.svelte'
  import { hexToHsv, hsvToHex } from './colorMath'
  import type { Hsv } from './colorMath'
  import TextField from '../../ui/kit/TextField.svelte'

  /**
   * A colour of the template editor, in little room: one control, a round swatch with the colour's
   * name or value. A click opens the colours to choose from: those of the template's
   * palette by name (they follow the palette when it changes), a few plain ones, and any colour in
   * a field of shades over a strip of hues, all in the one popover. A colour dragged to shows at once
   * and is set when the pointer lets go. The field at the foot takes a colour typed as #rrggbb, or
   * the name of a colour of the palette. The palette's own colours (`tokens` false) are colours, not names.
   */
  interface Props {
    id: string
    /** The colour: #rrggbb, the id of a colour of the palette, or null when it is not set. */
    value: string | null
    /** The colours of the palette, by id, to draw what a name stands for. */
    palette: Readonly<Record<string, unknown>>
    label: string
    tokens?: boolean
    /** Whether the element sets this colour itself (it can then go back to the one it takes). */
    own?: boolean
    invalid?: boolean
    disabled?: boolean
    /** A colour chosen: a value, the id of a colour of the palette, or null to take it from above. */
    onset: (value: string | null) => void
    /** A colour typed. */
    oncommit: (text: string) => void
  }
  let {
    id,
    value,
    palette,
    label,
    tokens = true,
    own = false,
    invalid = false,
    disabled = false,
    onset,
    oncommit,
  }: Props = $props()

  const lang = $derived(i18n.locale)
  /** Plain colours, from black to white. */
  const PLAIN = ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff']

  let open = $state(false)
  let root: HTMLElement | undefined = $state()
  /** Which edge of the field the colours line up with: the one with room beside it. */
  let edge = $state<'left' | 'right'>('left')
  /** The colour in the field of shades, and the one being dragged to (not yet set). */
  let hsv = $state<Hsv>({ h: 0, s: 0, v: 0 })
  let draft = $state<string | null>(null)
  function toggle(): void {
    if (!open) hsv = hexToHsv(hex(value) ?? '#000000')
    if (!open && root) {
      const field = root.getBoundingClientRect()
      const room = (root.closest('.properties') ?? document.body).getBoundingClientRect()
      edge = field.left + 260 <= room.right ? 'left' : 'right'
    }
    open = !open
  }

  const hex = (v: unknown): string | null => {
    const h = isColorToken(v) ? palette[v] : v
    return typeof h === 'string' && /^#[0-9a-f]{6}/i.test(h) ? h.slice(0, 7) : null
  }
  const nameOf = (v: string | null): string => {
    const token = COLOR_TOKENS.find((t) => t.id === v)
    return token ? token[lang] : (v ?? '')
  }
  /** What is typed: a name of a colour of the palette is that colour, anything else a value. */
  function commit(text: string): void {
    const token = COLOR_TOKENS.find((t) => t[lang] === text.trim() || t.id === text.trim())
    if (tokens && token) onset(token.id)
    else oncommit(text)
  }
  function pick(v: string | null): void {
    onset(v)
    open = false
  }
  const clamp = (n: number): number => Math.min(1, Math.max(0, n))
  /** The strip of hues, red round to red. */
  const HUES = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 100% 50%)`).join(', ')})`
  /** A colour from the shades or the hues: shown at once, set when `final`. */
  function shade(next: Hsv, final: boolean): void {
    hsv = next
    draft = hsvToHex(next)
    if (final) {
      onset(draft)
      draft = null
    }
  }
  function drag(event: PointerEvent, axis: 'shade' | 'hue'): void {
    const area = event.currentTarget as HTMLElement
    area.setPointerCapture(event.pointerId)
    const at = (e: PointerEvent): Hsv => {
      const r = area.getBoundingClientRect()
      const x = clamp((e.clientX - r.left) / r.width)
      const y = clamp((e.clientY - r.top) / r.height)
      return axis === 'shade' ? { ...hsv, s: x, v: 1 - y } : { ...hsv, h: x * 359.9 }
    }
    shade(at(event), false)
    const move = (e: PointerEvent): void => shade(at(e), false)
    const up = (e: PointerEvent): void => {
      shade(at(e), true)
      area.removeEventListener('pointermove', move)
      area.removeEventListener('pointerup', up)
    }
    area.addEventListener('pointermove', move)
    area.addEventListener('pointerup', up)
  }
  /** The arrow keys move through the shades or the hues in small steps. */
  function step(event: KeyboardEvent, axis: 'shade' | 'hue'): void {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[
      event.key
    ] as [number, number] | undefined
    if (!d) return
    event.preventDefault()
    if (axis === 'hue') shade({ ...hsv, h: (hsv.h + d[0] * 5 + 360) % 360 }, true)
    else shade({ ...hsv, s: clamp(hsv.s + d[0] * 0.05), v: clamp(hsv.v + d[1] * 0.05) }, true)
  }

  $effect(() => {
    if (!open) return
    const away = (event: PointerEvent): void => {
      if (root && !root.contains(event.target as Node)) open = false
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        open = false
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  })
</script>

<div class="color-field" bind:this={root}>
  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the colour, which opens the colours -->
  <button
    type="button"
    class="chip"
    class:unset={value === null}
    {id}
    data-value={value ?? ''}
    aria-label={label}
    title={nameOf(value) || '—'}
    aria-haspopup="dialog"
    aria-expanded={open}
    class:invalid
    {disabled}
    onclick={toggle}
  >
    <span class="swatch" style:--swatch={draft ?? hex(value) ?? 'transparent'}></span>
    <span class="name">{draft ?? (nameOf(value) || '—')}</span>
  </button>
  {#if open}
    <div class="float {edge}" role="dialog" aria-label={label}>
      <Popover width="narrow">
        {#if tokens}
          <div class="group" role="group" aria-label={i18n.t('templates.palette')}>
            <p class="caption">{i18n.t('templates.color.palette')}</p>
            {#each COLOR_TOKENS as token (token.id)}
              {@const on = value === token.id}
              <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a colour of the palette, with its name -->
              <button
                type="button"
                class="token"
                class:on
                aria-pressed={on}
                aria-label={token[lang]}
                onclick={() => pick(on ? hex(value) : token.id)}
              >
                <span class="dot" style:--swatch={hex(token.id) ?? 'transparent'}></span>
                {token[lang]}
              </button>
            {/each}
          </div>
        {/if}
        <div class="group" role="group" aria-label={i18n.t('templates.color.plain')}>
          <p class="caption">{i18n.t('templates.color.plain')}</p>
          <div class="plain">
            {#each PLAIN as c (c)}
              <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a plain colour, as a dot -->
              <button
                type="button"
                class="dot big"
                class:on={value?.toLowerCase() === c}
                style:--swatch={c}
                aria-label={c}
                title={c}
                onclick={() => pick(c)}
              ></button>
            {/each}
          </div>
        </div>
        <!-- Any colour: a field of shades of one hue, and the strip of hues under it. -->
        <div class="group" role="group" aria-label={i18n.t('templates.color.custom')}>
          <p class="caption">{i18n.t('templates.color.custom')}</p>
          <div
            class="shades"
            role="slider"
            tabindex="0"
            aria-label={i18n.t('templates.color.shade')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            aria-valuetext={draft ?? hsvToHex(hsv)}
            style:background={`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`}
            onpointerdown={(e) => drag(e, 'shade')}
            onkeydown={(e) => step(e, 'shade')}
          >
            <span
              class="knob"
              style:left="{hsv.s * 100}%"
              style:top="{(1 - hsv.v) * 100}%"
              style:--swatch={hsvToHex(hsv)}
            ></span>
          </div>
          <div
            class="hues"
            role="slider"
            tabindex="0"
            aria-label={i18n.t('templates.color.hue')}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            style:background={HUES}
            onpointerdown={(e) => drag(e, 'hue')}
            onkeydown={(e) => step(e, 'hue')}
          >
            <span
              class="knob"
              style:left="{(hsv.h / 360) * 100}%"
              style:top="50%"
              style:--swatch="hsl({hsv.h} 100% 50%)"
            ></span>
          </div>
        </div>
        <!-- The colour as a value: #rrggbb, or the name of a colour of the palette. -->
        <TextField
          id="{id}-value"
          label={i18n.t('templates.color.value')}
          value={draft ?? nameOf(value)}
          placeholder="#rrggbb"
          {invalid}
          {disabled}
          onchange={(e) => {
            commit((e.currentTarget as HTMLInputElement).value)
            open = false
          }}
        />
        {#if own}
          <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a quiet action at the foot -->
          <button type="button" class="reset" onclick={() => pick(null)}>
            {i18n.t('templates.color.reset')}
          </button>
        {/if}
      </Popover>
    </div>
  {/if}
</div>

<style>
  .color-field {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
  }
  /* The colour: a round swatch, ringed so white shows on white, and its name or value. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    max-width: 100%;
    height: var(--control-md);
    padding: 0 var(--sp-8) 0 var(--sp-4);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    color: var(--color-label);
    font: var(--type-body);
    cursor: default;
  }
  .chip:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  .chip[aria-expanded='true'],
  .chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .chip.invalid {
    border-color: var(--color-danger);
  }
  .chip.unset .name {
    color: var(--color-label-tertiary);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .swatch {
    flex: none;
    width: 18px;
    height: 18px;
    border: 1px solid var(--color-field-border);
    border-radius: 50%;
    background: var(--swatch);
  }
  .chip.unset .swatch {
    background: var(--color-control);
  }
  .float {
    position: absolute;
    z-index: 20;
    top: calc(100% + var(--sp-4));
  }
  .float.left {
    left: 0;
  }
  .float.right {
    right: 0;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .caption {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .token {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-4) var(--sp-8);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-label);
    font: var(--type-body);
    text-align: left;
    cursor: default;
  }
  .token:hover {
    background: var(--color-control-hover);
  }
  .token.on {
    background: var(--color-selection);
  }
  .dot {
    flex: none;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid var(--color-field-border);
    border-radius: 50%;
    background: var(--swatch);
  }
  .dot.big {
    width: 22px;
    height: 22px;
    cursor: default;
  }
  .dot.on {
    box-shadow:
      0 0 0 2px var(--color-window),
      0 0 0 4px var(--color-accent);
  }
  .plain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
  }
  /* The field of shades and the strip of hues: a ring shows where the colour is. */
  .shades,
  .hues {
    position: relative;
    border-radius: var(--r-sm);
    cursor: crosshair;
    touch-action: none;
  }
  .shades {
    height: 112px;
  }
  .hues {
    height: 12px;
  }
  .shades:focus-visible,
  .hues:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .knob {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-window);
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0 1px var(--color-label-tertiary);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .reset {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: var(--type-body);
    cursor: default;
  }
</style>
