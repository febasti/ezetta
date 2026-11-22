<script lang="ts">
  import { tick } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Segmented from '../../ui/kit/Segmented.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import { scrollbar } from '../../ui/scrollbar'
  import { setPreviewSidebar, setPreviewZoom, ui } from '../../lib/ui.svelte'
  import type { PreviewZoom } from '../../lib/ui.svelte'
  import { project } from '../sidebar/project.svelte'
  import { pageSrc, preview } from './preview.svelte'
  import {
    MAX_ZOOM,
    MIN_ZOOM,
    PX_PER_PT,
    ZOOM_STEPS,
    clampZoom,
    headingAt,
    pageAt,
    scaleOf,
    stepZoom,
  } from './previewZoom'

  /**
   * The pages of the export dialog's preview on their desk, with a bar above them: a sidebar beside
   * them that shows the pages small or the headings of the contents (a click goes there), and the
   * zoom (the buttons, the menu, Cmd with + − 0, and a pinch or Cmd with the wheel at the pointer).
   * The pages are SVG, so they are sharp at every size; each has its size before it is loaded, so
   * the column keeps its length and a zoom keeps the place in view.
   */

  /** The width of a page in the sidebar, in pixels. */
  const THUMB = 104

  let desk = $state<HTMLElement>()
  let sideList = $state<HTMLElement>()
  /** The room the pages have on the desk, without the space around them. */
  let room = $state({ width: 0, height: 0 })
  /** The page in view (from 0), and how far down it the view's top is, in pixels of the page drawn. */
  let current = $state(0)
  let currentY = $state(0)
  /** Where a click in the sidebar went: it stays the page in view until the desk is scrolled away (at the end of the column a page cannot come up to the top). */
  let jumped: { top: number; page: number; y: number } | null = null

  const ready = $derived(preview.status === 'ready' && preview.sizes.length > 0)
  const scale = $derived(scaleOf(ui.previewZoom, preview.sizes, room))
  const drawn = $derived(
    preview.sizes.map((p) => ({
      width: Math.round(p.width * PX_PER_PT * scale),
      height: Math.round(p.height * PX_PER_PT * scale),
    })),
  )
  const heading = $derived(headingAt(preview.outline, current + 1, currentY / (PX_PER_PT * scale)))

  const percent = (factor: number): string =>
    new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 0 }).format(
      factor,
    )
  /** The menu's entries: the two fits, the steps, and the factor a pinch left between two of them. */
  const zoomOptions = $derived.by(() => {
    const factors: number[] = [...ZOOM_STEPS]
    const own = ui.previewZoom
    if (typeof own === 'number' && !factors.some((f) => Math.abs(f - own) < 0.001))
      factors.push(own)
    factors.sort((a, b) => a - b)
    return [
      { value: 'page', label: i18n.t('preview.fitPage') },
      { value: 'width', label: i18n.t('preview.fitWidth') },
      ...factors.map((f) => ({ value: String(f), label: percent(f) })),
    ]
  })
  const zoomValue = $derived(String(ui.previewZoom))

  /** The room on the desk: its inner size less the space around the pages. */
  function measure(): void {
    if (!desk) return
    const pad = padding()
    room = {
      width: Math.max(0, desk.clientWidth - 2 * pad),
      height: Math.max(0, desk.clientHeight - 2 * pad),
    }
  }
  $effect(() => {
    if (!desk) return
    const observer = new ResizeObserver(measure)
    observer.observe(desk)
    measure()
    return () => observer.disconnect()
  })
  // The pictures came: the room is measured again (the space around them is set only now).
  $effect(() => {
    if (ready) void tick().then(measure)
  })

  /** The space above the first page. */
  const padding = (): number => {
    const sheets = desk?.firstElementChild
    return sheets instanceof HTMLElement ? parseFloat(getComputedStyle(sheets).paddingTop) : 0
  }

  const pageElements = (): HTMLElement[] =>
    desk ? Array.from(desk.querySelectorAll<HTMLElement>('img.page')) : []

  /** Which page the view's top is on, for the bar, the sidebar and the outline. */
  function track(): void {
    const pages = pageElements()
    if (!desk || pages.length === 0) return
    if (jumped && Math.abs(desk.scrollTop - jumped.top) <= 2) {
      current = jumped.page
      currentY = jumped.y
      return
    }
    jumped = null
    // Just below the top of the view, where a page or heading that was gone to stands; at the end of
    // the column, whose last page cannot come up to the top, the last page.
    const probe = desk.scrollTop + padding() + 1
    const end = desk.scrollTop >= desk.scrollHeight - desk.clientHeight - 1
    const i = end
      ? pages.length - 1
      : pageAt(
          pages.map((p) => p.offsetTop),
          probe,
        )
    current = i
    currentY = end ? Number.POSITIVE_INFINITY : Math.max(0, probe - pages[i]!.offsetTop)
  }
  let tracking = 0
  const onScroll = (): void => {
    cancelAnimationFrame(tracking)
    tracking = requestAnimationFrame(track)
  }

  // The page in view is kept in view in the sidebar too.
  $effect(() => {
    void current
    if (!ui.previewSidebarVisible || ui.previewSidebarTab !== 'pages' || !sideList) return
    sideList
      .querySelector<HTMLElement>(`[data-page="${current + 1}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })

  /** A place on the desk (pixels from its top left corner), as a page and the fraction of it. */
  function anchorAt(x: number, y: number): { page: number; fx: number; fy: number } | null {
    const pages = pageElements()
    if (!desk || pages.length === 0) return null
    const at = { x: desk.scrollLeft + x, y: desk.scrollTop + y }
    const i = pageAt(
      pages.map((p) => p.offsetTop),
      at.y,
    )
    const p = pages[i]!
    return {
      page: i,
      fx: (at.x - p.offsetLeft) / p.offsetWidth,
      fy: (at.y - p.offsetTop) / p.offsetHeight,
    }
  }

  /** Changes the zoom and keeps the place at `x`, `y` of the desk where it was (the middle by default). */
  async function zoomTo(next: PreviewZoom, x?: number, y?: number): Promise<void> {
    if (!desk) return
    const px = x ?? desk.clientWidth / 2
    const py = y ?? desk.clientHeight / 2
    const anchor = anchorAt(px, py)
    setPreviewZoom(next)
    await tick()
    const p = anchor ? pageElements()[anchor.page] : undefined
    if (!desk || !anchor || !p) return
    desk.scrollLeft = p.offsetLeft + anchor.fx * p.offsetWidth - px
    desk.scrollTop = p.offsetTop + anchor.fy * p.offsetHeight - py
    track()
  }

  const zoomStep = (direction: 1 | -1): void => void zoomTo(stepZoom(scale, direction))

  function onZoomChoice(value: string): void {
    void zoomTo(value === 'page' || value === 'width' ? value : clampZoom(Number(value)))
  }

  // A pinch on the trackpad arrives as the wheel with Ctrl; Cmd (Ctrl) with the wheel does the same.
  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    if (!desk || !ready) return
    const box = desk.getBoundingClientRect()
    const factor = clampZoom(scale * Math.exp(-event.deltaY * 0.01))
    if (Math.abs(factor - scale) < 0.001) return
    void zoomTo(
      Math.round(factor * 100) / 100,
      event.clientX - box.left - desk.clientLeft,
      event.clientY - box.top - desk.clientTop,
    )
  }
  $effect(() => {
    if (!desk) return
    const element = desk
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  })

  // Cmd (Ctrl) with + or = zooms in, with − out, with 0 back to the page's width, as viewers do.
  function onKeydown(event: KeyboardEvent): void {
    if (!ready || !(event.metaKey || event.ctrlKey) || event.altKey) return
    if (event.key === '+' || event.key === '=') zoomStep(1)
    else if (event.key === '-') zoomStep(-1)
    else if (event.key === '0') void zoomTo('width')
    else return
    event.preventDefault()
  }

  /** Brings a page (from 0) into view, `y` points down it. */
  function goTo(page: number, y = 0): void {
    const p = pageElements()[page]
    if (!desk || !p) return
    const top = Math.max(0, p.offsetTop + y * PX_PER_PT * scale - padding())
    desk.scrollTo({ top })
    // Where it came to: less than asked for at the end of the column.
    jumped = { top: desk.scrollTop, page, y: y * PX_PER_PT * scale + 1 }
    track()
  }

  /** In the sidebar's pages the arrow keys go to the page before or after. */
  function onThumbKey(event: KeyboardEvent, page: number): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = Math.min(preview.pages - 1, Math.max(0, page + step))
    goTo(next)
    sideList?.querySelector<HTMLElement>(`[data-page="${next + 1}"]`)?.focus()
  }

  const press =
    (action: () => void) =>
    (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      action()
    }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="preview" aria-label={i18n.t('preview.title')}>
  <div class="bar">
    <IconButton
      icon="panel-left"
      size="sm"
      label={i18n.t('preview.sidebar')}
      pressed={ui.previewSidebarVisible}
      onclick={() => setPreviewSidebar(!ui.previewSidebarVisible)}
    />
    {#if ready}
      <span class="where">
        {i18n.t('preview.position', { page: current + 1, count: preview.pages })}
      </span>
    {/if}
    <span class="zoom">
      <IconButton
        icon="zoom-out"
        size="sm"
        label={i18n.t('preview.zoomOut')}
        disabled={!ready || scale <= MIN_ZOOM + 0.001}
        onclick={() => zoomStep(-1)}
      />
      <Select
        size="sm"
        label={i18n.t('preview.zoom')}
        value={zoomValue}
        options={zoomOptions}
        disabled={!ready}
        onchange={onZoomChoice}
      />
      <IconButton
        icon="zoom-in"
        size="sm"
        label={i18n.t('preview.zoomIn')}
        disabled={!ready || scale >= MAX_ZOOM - 0.001}
        onclick={() => zoomStep(1)}
      />
    </span>
  </div>

  <div class="body">
    {#if ui.previewSidebarVisible}
      <aside class="side" aria-label={i18n.t('preview.sidebar')}>
        <div class="switch">
          <Segmented
            size="sm"
            stretch
            label={i18n.t('preview.sidebar')}
            value={ui.previewSidebarTab}
            options={[
              { value: 'pages', label: i18n.t('preview.thumbnails'), icon: 'pages' },
              { value: 'outline', label: i18n.t('preview.outline'), icon: 'list-tree' },
            ]}
            onchange={(tab) => setPreviewSidebar(true, tab)}
          />
        </div>
        <div class="list" use:scrollbar bind:this={sideList}>
          {#if !ready}
            <!-- Nothing to list before the pages are made. -->
          {:else if ui.previewSidebarTab === 'pages'}
            <div class="thumbs" role="group" aria-label={i18n.t('preview.thumbnails')}>
              {#each preview.sizes as size, i (i)}
                {@const selected = i === current}
                <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a page is a small picture of itself, a control of its own -->
                <button
                  type="button"
                  class="thumb"
                  class:selected
                  data-page={i + 1}
                  aria-current={selected ? 'page' : undefined}
                  aria-label={i18n.t('preview.pageLabel', { page: i + 1 })}
                  onclick={() => goTo(i)}
                  onkeydown={(e) => onThumbKey(e, i)}
                >
                  <img
                    class="small"
                    src={pageSrc(i + 1)}
                    alt=""
                    width={THUMB}
                    height={Math.round((THUMB * size.height) / size.width)}
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <span class="number">{i + 1}</span>
                </button>
              {/each}
            </div>
          {:else if preview.outline.length === 0}
            <p class="none">{i18n.t('preview.noHeadings')}</p>
          {:else}
            <div class="headings" role="group" aria-label={i18n.t('preview.outline')}>
              {#each preview.outline as entry, i (i)}
                {@const go = () => goTo(entry.page - 1, entry.y)}
                <ListRow
                  title={entry.number ? `${entry.number}\u2002${entry.text}` : entry.text}
                  depth={entry.level - 1}
                  strong={entry.level === 1}
                  selected={i === heading}
                  role="button"
                  tabindex={0}
                  aria-selected={undefined}
                  aria-current={i === heading ? 'location' : undefined}
                  onclick={go}
                  onkeydown={press(go)}
                >
                  {#snippet accessory()}
                    <span class="page-number">{entry.page}</span>
                  {/snippet}
                </ListRow>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    {/if}

    <div class="desk" use:scrollbar={{ horizontal: true }} bind:this={desk} onscroll={onScroll}>
      {#if preview.status === 'error'}
        <p class="empty problem" role="alert">
          {preview.noCompiler ? i18n.t('preview.noCompiler') : i18n.t('preview.failed')}
        </p>
      {:else if ready}
        <div class="sheets" class:dim={preview.busy}>
          {#each drawn as size, i (i)}
            <img
              class="page"
              src={pageSrc(i + 1)}
              alt={i18n.t('preview.pageLabel', { page: i + 1 })}
              style:width="{size.width}px"
              style:height="{size.height}px"
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          {/each}
        </div>
      {:else}
        <p class="empty">{project.snapshot ? i18n.t('preview.loading') : ''}</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .preview {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-8);
    min-width: 0;
    min-height: 0;
  }
  .bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
  }
  .where {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zoom {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    margin-left: auto;
  }
  .body {
    display: flex;
    flex: 1;
    gap: var(--sp-8);
    min-height: 0;
  }
  /* The sidebar: the pages small, or the headings, on the window's ground beside the desk. */
  .side {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--sp-8);
    width: 168px;
    min-height: 0;
  }
  .switch {
    flex: none;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .thumbs {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-4);
  }
  /* A page is a small picture of itself and its number under it; the one in view lies on the
   * selection's ground, as the chosen template does. */
  .thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-4);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    cursor: default;
  }
  .thumb.selected {
    background: var(--color-selection);
    color: var(--color-label);
  }
  .thumb:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .small {
    display: block;
    background: var(--color-paper);
    box-shadow: var(--shadow-paper);
    pointer-events: none;
  }
  .headings {
    padding: 0 var(--sp-4);
  }
  .page-number {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
  }
  .none {
    margin: var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-body);
  }
  /* The pages lie on the panel's ground, as on a desk. A clear border as deep as the rounded corner
     keeps the ends of the scrollbars out of the corners; the panel's ground runs under it, and the
     pages' padding is less by as much. */
  .desk {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: auto;
    border: var(--r-lg) solid transparent;
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  /* As wide as the widest page needs, and never less than the desk: a page wider than the desk
     scrolls across, a narrower one stands in the middle. */
  .sheets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-24);
    box-sizing: border-box;
    width: max-content;
    min-width: 100%;
    padding: calc(var(--sp-24) - var(--r-lg));
  }
  .sheets.dim {
    opacity: 0.6;
  }
  .page {
    display: block;
    flex: none;
    background: var(--color-paper);
    box-shadow: var(--shadow-paper);
  }
  .empty {
    margin: var(--sp-24);
    color: var(--color-label-tertiary);
    font: var(--type-body);
  }
  .problem {
    color: var(--color-danger);
  }
</style>
