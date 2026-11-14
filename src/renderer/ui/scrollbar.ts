/**
 * The app's own scrollbar for an element that scrolls up and down. The system's scrollbar is hidden
 * (macOS draws it to the very edge of the area, so rounded corners cut its ends off, and on Linux and
 * Windows it takes room); this one is a thin thumb that floats over the content, clear of every
 * edge, as macOS's overlay bars do: it shows while the area scrolls or the pointer is at its right
 * edge, fades out a moment later, widens under the pointer, can be dragged, and a press on its track
 * pages up or down. It looks the same on every system and takes no room.
 *
 * The bar lies over the area, in its nearest positioned ancestor (`offsetParent`), so it does not
 * scroll with the content and the content's own markup is left alone. Used as a Svelte action
 * (`use:scrollbar`) or called on plain DOM (the editor, its menus). Its look is in `kit/dom.css`.
 */

/** How long the bar stays after the last scroll, in milliseconds. */
const LINGER = 900
/** How near the right edge the pointer brings the bar up, in pixels. */
const EDGE = 12
/** The thumb's distance from the top and bottom of the area, in pixels. */
const INSET = 3
/** The shortest thumb, in pixels. */
const MIN_THUMB = 24

export function scrollbar(element: HTMLElement): { destroy(): void } {
  element.classList.add('k-scroll')
  const rail = document.createElement('div')
  rail.className = 'k-scroll-rail'
  rail.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('div')
  thumb.className = 'k-scroll-thumb'
  rail.append(thumb)

  let timer: ReturnType<typeof setTimeout> | undefined
  let over = false
  let drag: { y: number; scroll: number; ratio: number } | undefined
  // The thumb's length and its travel, from the last placing.
  let length = 0
  let travel = 0

  /** Puts the rail over the area's right edge and the thumb where the area is scrolled to. */
  function place(): boolean {
    const host = element.offsetParent
    const { scrollHeight, clientHeight, scrollTop } = element
    if (!element.isConnected || !(host instanceof HTMLElement) || scrollHeight <= clientHeight + 1)
      return false
    if (rail.parentElement !== host) host.append(rail)
    const outer = host.getBoundingClientRect()
    const inner = element.getBoundingClientRect()
    const top = inner.top - outer.top - host.clientTop + host.scrollTop + element.clientTop
    const left = inner.left - outer.left - host.clientLeft + host.scrollLeft + element.clientLeft
    rail.style.top = `${top}px`
    rail.style.left = `${left + element.clientWidth}px`
    rail.style.height = `${clientHeight}px`
    const track = clientHeight - 2 * INSET
    length = Math.max(MIN_THUMB, Math.round((track * clientHeight) / scrollHeight))
    travel = Math.max(0, track - length)
    const offset = travel * (scrollTop / (scrollHeight - clientHeight))
    thumb.style.height = `${length}px`
    thumb.style.transform = `translateY(${INSET + offset}px)`
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

  const onScroll = (): void => show()
  const onPointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0) return
    const box = element.getBoundingClientRect()
    const edge = box.left + element.clientLeft + element.clientWidth
    if (event.clientX >= edge - EDGE && event.clientX <= edge) show()
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
      const range = element.scrollHeight - element.clientHeight
      drag = { y: event.clientY, scroll: element.scrollTop, ratio: travel > 0 ? range / travel : 0 }
      thumb.setPointerCapture(event.pointerId)
      rail.classList.add('dragging')
      return
    }
    // On the track: a page up or down, toward the press, as the system's bar does.
    const above = event.clientY < thumb.getBoundingClientRect().top
    element.scrollBy({ top: (above ? -1 : 1) * element.clientHeight * 0.9 })
  }
  const onThumbMove = (event: PointerEvent): void => {
    if (!drag) return
    element.scrollTop = drag.scroll + (event.clientY - drag.y) * drag.ratio
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
  const resize = new ResizeObserver(() => {
    if (rail.classList.contains('visible') && !place()) rail.classList.remove('visible')
  })

  element.addEventListener('scroll', onScroll, { passive: true })
  element.addEventListener('pointermove', onPointerMove, { passive: true })
  rail.addEventListener('pointerenter', onRailEnter)
  rail.addEventListener('pointerleave', onRailLeave)
  rail.addEventListener('pointerdown', onRailDown)
  rail.addEventListener('mousedown', keepFocus)
  rail.addEventListener('wheel', onWheel, { passive: false })
  thumb.addEventListener('pointermove', onThumbMove)
  thumb.addEventListener('pointerup', onThumbUp)
  thumb.addEventListener('pointercancel', onThumbUp)
  resize.observe(element)

  return {
    destroy() {
      clearTimeout(timer)
      resize.disconnect()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('pointermove', onPointerMove)
      element.classList.remove('k-scroll')
      rail.remove()
    },
  }
}
