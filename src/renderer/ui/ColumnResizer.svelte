<script lang="ts">
  import { i18n } from '../i18n/i18n.svelte'

  interface Props {
    width: number
    onresize: (width: number) => void
    /** Which side of the column the handle is on: a right sidebar grows when dragged to the left. */
    side?: 'left' | 'right'
  }
  let { width, onresize, side = 'left' }: Props = $props()
  const direction = $derived(side === 'left' ? 1 : -1)

  function onPointerDown(event: PointerEvent): void {
    const start = { x: event.clientX, width }
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent): void =>
      onresize(start.width + (e.clientX - start.x) * direction)
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') onresize(width - 16 * direction)
    else if (event.key === 'ArrowRight') onresize(width + 16 * direction)
    else return
    event.preventDefault()
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div
  class="resizer"
  role="separator"
  aria-orientation="vertical"
  aria-label={i18n.t('sidebar.resize')}
  aria-valuenow={width}
  tabindex="0"
  onpointerdown={onPointerDown}
  onkeydown={onKeydown}
></div>

<style>
  /* Sits on the hairline between two columns; shows a line in the accent while it is used. */
  .resizer {
    position: relative;
    z-index: 5;
    flex: none;
    width: var(--sp-8);
    margin: 0 calc(-1 * var(--sp-4));
    cursor: col-resize;
  }
  .resizer::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--sp-4) - 1px);
    width: 2px;
    background: transparent;
    transition: background var(--duration);
  }
  .resizer:hover::after,
  .resizer:focus-visible::after,
  .resizer:active::after {
    background: var(--color-accent);
  }
  .resizer:focus-visible {
    outline: none;
  }
</style>
