<script lang="ts">
  import type { Drawing } from './schematics'

  /**
   * One drawing of the template editor (`schematics.ts`) on a tile of its own: paper in white, text
   * as grey bars, the marks of the values in the accent. The value whose field is pointed at or has
   * the focus has its mark drawn stronger and the band it spans lit.
   */
  interface Props {
    drawing: Drawing
    /** The property whose field is pointed at or focused. */
    hot: string | null
  }
  let { drawing, hot }: Props = $props()

  /** Half a pixel, so a line one pixel wide falls on whole pixels. */
  const px = (n: number): number => Math.round(n) + 0.5
  /** The hatching of a drawing, its own for each drawing on the page. */
  const uid = $props.id()
  const hatch = `hatch-${uid}`
</script>

<svg
  class="drawing"
  viewBox="0 0 128 {drawing.h}"
  width="128"
  height={drawing.h}
  aria-hidden="true"
>
  {#if drawing.shapes.some((s) => s.kind === 'hatch')}
    <defs>
      <pattern id={hatch} width="3" height="3" patternUnits="userSpaceOnUse">
        <path class="hatching" d="M-1 1L1 -1M0 3L3 0M2 4L4 2" />
      </pattern>
    </defs>
  {/if}
  <rect class="tile" width="128" height={drawing.h} rx="6" />
  {#each drawing.shapes as s, i (i)}
    {#if s.kind === 'sheet'}
      <rect class="sheet" x={px(s.x)} y={px(s.y)} width={s.w - 1} height={s.h - 1} rx="1" />
    {:else if s.kind === 'hatch'}
      <rect class="hatch" x={s.x} y={s.y} width={s.w} height={s.h} />
      <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="url(#{hatch})" />
    {:else if s.kind === 'bar'}
      <rect
        class="bar {s.tone ?? 'text'}"
        x={s.x}
        y={s.y}
        width={Math.max(s.w, 0)}
        height={s.h}
        rx={s.tone === 'tint' ? 1 : Math.min(s.h / 2, 1.5)}
      />
    {:else if s.kind === 'picture'}
      <g class="picture">
        <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="1" />
        <circle cx={s.x + s.w * 0.72} cy={s.y + s.h * 0.3} r={Math.min(s.w, s.h) * 0.1} />
        <path
          d="M{s.x} {s.y + s.h}L{s.x + s.w * 0.32} {s.y + s.h * 0.48}L{s.x + s.w * 0.52} {s.y +
            s.h * 0.74}L{s.x + s.w * 0.68} {s.y + s.h * 0.58}L{s.x + s.w} {s.y + s.h}Z"
        />
      </g>
    {:else if s.kind === 'line'}
      <line
        class="line {s.style ?? 'solid'}"
        class:faint={s.faint}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        stroke-width={s.weight ?? 1}
      />
    {:else if s.kind === 'box'}
      <rect
        class="box"
        class:dashed={s.dashed}
        class:faint={s.faint}
        x={px(s.x)}
        y={px(s.y)}
        width={s.w - 1}
        height={s.h - 1}
        rx={s.r ?? 0}
      />
    {:else if s.shape === 'dot'}
      <!-- Every bullet is three pixels wide around its centre, so a mark can end right at it. -->
      <circle class="marker" cx={s.x} cy={s.y} r="1.5" />
    {:else if s.shape === 'ring'}
      <circle class="marker ring" cx={s.x} cy={s.y} r="1" />
    {:else if s.shape === 'square'}
      <rect class="marker" x={s.x - 1.5} y={s.y - 1.5} width="3" height="3" />
    {:else if s.shape === 'dash'}
      <rect class="marker" x={s.x - 1.5} y={s.y - 0.5} width="3" height="1" />
    {:else}
      <path
        class="marker"
        d="M{s.x - 1.5} {s.y - 1.75}L{s.x + 1.5} {s.y}L{s.x - 1.5} {s.y + 1.75}Z"
      />
    {/if}
  {/each}
  {#each drawing.marks as m, i (i)}
    <g class="mark {m.kind}" class:hot={hot === m.prop}>
      {#if m.kind === 'h' || m.kind === 'v'}
        {#if m.band}
          <rect class="band" x={m.band.x} y={m.band.y} width={m.band.w} height={m.band.h} />
        {/if}
        <!-- The line fills the pixels from x to x + len; its ends stand in the first and the last of
             them, five pixels long with the line in their middle. -->
        {#if m.kind === 'h' && m.len > 0}
          <path
            d="M{m.x} {px(m.y)}H{m.x + m.len}M{px(m.x)} {m.y - 2}V{m.y + 3}M{px(m.x + m.len) -
              1} {m.y - 2}V{m.y + 3}"
          />
        {:else if m.kind === 'v'}
          <path
            d="M{px(m.x)} {m.y}V{m.y + m.len}M{m.x - 2} {px(m.y)}H{m.x + 3}M{m.x - 2} {px(
              m.y + m.len,
            ) - 1}H{m.x + 3}"
          />
        {/if}
      {:else if m.kind === 'edge'}
        <line class:on={m.on} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />
      {:else if m.kind === 'line'}
        <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />
      {:else if m.kind === 'corner'}
        <path
          d="M{m.x - m.r - 3} {m.y + 0.5}H{m.x - m.r}A{m.r} {m.r} 0 0 1 {m.x - 0.5} {m.y +
            m.r}V{m.y + m.r + 3}"
        />
      {:else if m.kind === 'area'}
        <rect class="band" x={m.x} y={m.y} width={m.w} height={m.h} rx="1" />
      {/if}
    </g>
  {/each}
</svg>

<style>
  .drawing {
    display: block;
  }
  .tile {
    fill: var(--color-panel);
  }
  .sheet {
    fill: var(--color-window);
    stroke: var(--color-field-border);
    stroke-width: 1;
  }
  .hatch {
    fill: var(--color-control);
  }
  .hatching {
    stroke: var(--color-label-tertiary);
    stroke-width: 0.8;
  }
  .bar.text {
    fill: var(--color-control-pressed);
  }
  .bar.strong {
    fill: var(--color-label-tertiary);
  }
  .bar.tint {
    fill: var(--color-control);
  }
  .picture rect {
    fill: var(--color-control);
  }
  .picture circle,
  .picture path {
    fill: var(--color-control-pressed);
  }
  .line {
    stroke: var(--color-label-secondary);
  }
  .line.faint {
    stroke: var(--color-field-border);
  }
  .line.dashed {
    stroke-dasharray: 3 2;
  }
  .line.dotted {
    stroke-dasharray: 0.01 2.5;
    stroke-linecap: round;
    stroke-width: 1.4;
  }
  .box {
    fill: none;
    stroke: var(--color-label-secondary);
  }
  .box.faint {
    stroke: var(--color-label-tertiary);
  }
  .box.dashed {
    stroke-dasharray: 2 2;
  }
  .marker {
    fill: var(--color-label-tertiary);
  }
  .marker.ring {
    fill: none;
    stroke: var(--color-label-tertiary);
    stroke-width: 1;
  }
  /* The marks: quiet until their field is pointed at. */
  .mark {
    opacity: 0.7;
    transition: opacity var(--duration);
  }
  .mark.hot {
    opacity: 1;
  }
  .mark path,
  .mark line {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 1;
  }
  .band {
    fill: var(--color-accent);
    opacity: 0;
    transition: opacity var(--duration);
  }
  .mark.hot .band {
    opacity: 0.16;
  }
  .mark.area .band {
    opacity: 0.18;
  }
  .mark.area.hot .band {
    opacity: 0.4;
  }
  /* A side of a box that is on is drawn as the line it is; one that is off is only a dashed place. */
  .mark.edge {
    opacity: 1;
  }
  .mark.edge line {
    stroke: var(--color-label-tertiary);
    stroke-dasharray: 2 2;
  }
  .mark.edge line.on {
    stroke: var(--color-label-secondary);
    stroke-width: 1.5;
    stroke-dasharray: none;
  }
  .mark.edge.hot line {
    stroke: var(--color-accent);
  }
  /* The weight of a line shows over the line only while its field is pointed at. */
  .mark.line {
    opacity: 0;
  }
  .mark.line.hot {
    opacity: 1;
  }
  .mark.line line {
    stroke-width: 2.5;
  }
  .mark.corner path {
    stroke-width: 1.5;
  }
</style>
