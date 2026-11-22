/**
 * The app's own scrollbar for an element that scrolls up and down (and, where asked, across). The
 * system's scrollbar is hidden (macOS draws it to the very edge of the area, so rounded corners cut
 * its ends off, and on Linux and Windows it takes room); this one is a thin thumb that floats over
 * the content, clear of every edge, as macOS's overlay bars do: it shows while the area scrolls or
 * the pointer is at its edge, fades out a moment later, widens under the pointer, can be dragged,
 * and a press on its track pages toward the press. It looks the same on every system and takes no
 * room.
 *
 * The bar lies over the area, in its nearest positioned ancestor (`offsetParent`), so it does not
 * scroll with the content and the content's own markup is left alone. Used as a Svelte action
 * (`use:scrollbar`, or `use:scrollbar={{ horizontal: true }}` for a second bar along the bottom
 * edge) or called on plain DOM (the editor, its menus). Its look is in `kit/dom.css`.
 */

/** How long the bar stays after the last scroll, in milliseconds. */
const LINGER = 900
/** How near the edge the pointer brings the bar up, in pixels. */
const EDGE = 12
/** The thumb's distance from the ends of the area, in pixels. */
const INSET = 3
/** The shortest thumb, in pixels. */
const MIN_THUMB = 24

export interface ScrollbarOptions {
  /** A bar along the bottom edge too, for an area that scrolls across (the zoomed preview). */
  horizontal?: boolean
}

type Axis = 'y' | 'x'

/** What a bar reads and sets of the area, for its direction. */
const AXES = {
  y: {
    scroll: (e: HTMLElement) => e.scrollTop,
    setScroll: (e: HTMLElement, value: number) => (e.scrollTop = value),
    size: (e: HTMLElement) => e.scrollHeight,
    client: (e: HTMLElement) => e.clientHeight,
    pointer: (event: PointerEvent) => event.clientY,
    start: (box: DOMRect) => box.top,
  },
  x: {
    scroll: (e: HTMLElement) => e.scrollLeft,
    setScroll: (e: HTMLElement, value: number) => (e.scrollLeft = value),
    size: (e: HTMLElement) => e.scrollWidth,
    client: (e: HTMLElement) => e.clientWidth,
    pointer: (event: PointerEvent) => event.clientX,
    start: (box: DOMRect) => box.left,
  },
} as const

interface Bar {
  rail: HTMLDivElement
  show(): void
  hideNow(): void
  /** Whether the pointer at this place is at the bar's edge of the area. */
  atEdge(event: PointerEvent): boolean
  destroy(): void
}

function makeBar(element: HTMLElement, axis: Axis): Bar {
  const a = AXES[axis]
  const rail = document.createElement('div')
  rail.className = axis === 'y' ? 'k-scroll-rail' : 'k-scroll-rail horizontal'
  rail.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('div')
  thumb.className = 'k-scroll-thumb'
  rail.append(thumb)

  let timer: ReturnType<typeof setTimeout> | undefined
  let over = false
  let drag: { at: number; scroll: number; ratio: number } | undefined
  // The thumb's length and its travel, from the last placing.
  let length = 0
  let travel = 0

  /** Puts the rail over the area's edge and the thumb where the area is scrolled to. */
  function place(): boolean {
    const host = element.offsetParent
    const size = a.size(element)
    const client = a.client(element)
    if (!element.isConnected || !(host instanceof HTMLElement) || size <= client + 1) return false
    if (rail.parentElement !== host) host.append(rail)
    const outer = host.getBoundingClientRect()
    const inner = element.getBoundingClientRect()
    const top = inner.top - outer.top - host.clientTop + host.scrollTop + element.clientTop
    const left = inner.left - outer.left - host.clientLeft + host.scrollLeft + element.clientLeft
    const track = client - 2 * INSET
    length = Math.max(MIN_THUMB, Math.round((track * client) / size))
    travel = Math.max(0, track - length)
    const offset = travel * (a.scroll(element) / (size - client))
    if (axis === 'y') {
      rail.style.top = `${top}px`
      rail.style.left = `${left + element.clientWidth}px`
      rail.style.height = `${client}px`
      thumb.style.height = `${length}px`
      thumb.style.transform = `translateY(${INSET + offset}px)`
    } else {
      rail.style.top = `${top + element.clientHeight}px`
      rail.style.left = `${left}px`
      rail.style.width = `${client}px`
      thumb.style.width = `${length}px`
      thumb.style.transform = `translateX(${INSET + offset}px)`
    }
    return true
  }

  function hide(): void {
    if (over || drag) return
    rail.classList.remove('visible')
  }

  function show(): void {
    clearTimeout(timer)
    if (!place()) {
      rail.classList.remove('visible')
      return
    }
    rail.classList.add('visible')
    timer = setTimeout(hide, LINGER)
  }

  function atEdge(event: PointerEvent): boolean {
    const box = element.getBoundingClientRect()
    if (axis === 'y') {
      const edge = box.left + element.clientLeft + element.clientWidth
      return event.clientX >= edge - EDGE && event.clientX <= edge
    }
    const edge = box.top + element.clientTop + element.clientHeight
    return event.clientY >= edge - EDGE && event.clientY <= edge
  }

  const onRailEnter = (): void => {
    over = true
    clearTimeout(timer)
  }
  const onRailLeave = (): void => {
    over = false
    if (!drag) timer = setTimeout(hide, LINGER)
  }
  // A press on the bar must not take the focus from where it is (the editor, a field with its menu).
  const keepFocus = (event: MouseEvent): void => event.preventDefault()
  const onRailDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    event.preventDefault()
    if (event.target === thumb) {
      const range = a.size(element) - a.client(element)
      drag = {
        at: a.pointer(event),
        scroll: a.scroll(element),
        ratio: travel > 0 ? range / travel : 0,
      }
      thumb.setPointerCapture(event.pointerId)
      rail.classList.add('dragging')
      return
    }
    // On the track: a page toward the press, as the system's bar does.
    const before = a.pointer(event) < a.start(thumb.getBoundingClientRect())
    const step = (before ? -1 : 1) * a.client(element) * 0.9
    element.scrollBy(axis === 'y' ? { top: step } : { left: step })
  }
  const onThumbMove = (event: PointerEvent): void => {
    if (!drag) return
    a.setScroll(element, drag.scroll + (a.pointer(event) - drag.at) * drag.ratio)
  }
  const onThumbUp = (event: PointerEvent): void => {
    if (!drag) return
    drag = undefined
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId)
    rail.classList.remove('dragging')
    if (!over) timer = setTimeout(hide, LINGER)
  }
  // The rail is not inside the area, so a wheel over it is passed on to the area.
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? element.clientHeight
          : 1
    element.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit })
  }

  rail.addEventListener('pointerenter', onRailEnter)
  rail.addEventListener('pointerleave', onRailLeave)
  rail.addEventListener('pointerdown', onRailDown)
  rail.addEventListener('mousedown', keepFocus)
  rail.addEventListener('wheel', onWheel, { passive: false })
  thumb.addEventListener('pointermove', onThumbMove)
  thumb.addEventListener('pointerup', onThumbUp)
  thumb.addEventListener('pointercancel', onThumbUp)

  return {
    rail,
    show,
    atEdge,
    hideNow() {
      if (rail.classList.contains('visible') && !place()) rail.classList.remove('visible')
    },
    destroy() {
      clearTimeout(timer)
      rail.remove()
    },
  }
}

export function scrollbar(
  element: HTMLElement,
  options: ScrollbarOptions = {},
): { destroy(): void } {
  element.classList.add('k-scroll')
  const bars = [makeBar(element, 'y'), ...(options.horizontal ? [makeBar(element, 'x')] : [])]
  // The bar along the bottom comes up only when the area scrolls across.
  let left = element.scrollLeft

  const onScroll = (): void => {
    const across = element.scrollLeft !== left
    left = element.scrollLeft
    bars[0]!.show()
    if (across) bars[1]?.show()
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0) return
    for (const bar of bars) if (bar.atEdge(event)) bar.show()
  }
  const resize = new ResizeObserver(() => {
    for (const bar of bars) bar.hideNow()
  })

  element.addEventListener('scroll', onScroll, { passive: true })
  element.addEventListener('pointermove', onPointerMove, { passive: true })
  resize.observe(element)

  return {
    destroy() {
      resize.disconnect()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('pointermove', onPointerMove)
      element.classList.remove('k-scroll')
      for (const bar of bars) bar.destroy()
    },
  }
}
