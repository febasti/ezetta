/**
 * The tooltip of a chip (a citation, a cross-reference): it shows what the chip stands for, in full.
 * Chips are widgets, so it is a plain element on the page, not a CodeMirror tooltip: one at a time,
 * under the chip after a short rest of the pointer, gone when the pointer leaves, a key is pressed,
 * anything is clicked, or the text scrolls.
 *
 * The editor may draw a chip again while the pointer rests on it (after an autosave, a new number):
 * the new element gets no `mouseenter`, and the old one no `mouseleave`. So the tooltip goes by the
 * element under the pointer when it shows, and by where the pointer is when it hides.
 *
 * A scroll removes a tooltip that shows but does not stop one that is waiting: its scroll event
 * can come a frame after the pointer reached the chip (a chip scrolled into view under it), and
 * when the wait ends the chip under the pointer, if any, decides.
 */

const DELAY_MS = 350
const GAP = 6
const MARGIN = 8

let tip: HTMLElement | null = null
let timer: number | undefined
let owner: HTMLElement | null = null
let listening = false
/** What each chip shows; a chip drawn again is registered again with its own. */
const builders = new WeakMap<HTMLElement, () => HTMLElement | null>()
const pointer = { x: -1, y: -1 }

/** The chip with a tooltip under a point, if any. */
function chipAt(x: number, y: number): HTMLElement | null {
  const found = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-chip-tip]') ?? null
  return found && builders.has(found) ? found : null
}

/** Removes the tooltip that shows, if any. */
function remove(): void {
  tip?.remove()
  tip = null
  owner?.removeAttribute('aria-describedby')
  owner = null
}

function hide(): void {
  window.clearTimeout(timer)
  timer = undefined
  remove()
}

function listen(): void {
  if (listening) return
  listening = true
  for (const type of ['mousedown', 'keydown', 'wheel'] as const)
    window.addEventListener(type, hide, { capture: true, passive: true })
  window.addEventListener('scroll', remove, { capture: true, passive: true })
  window.addEventListener('blur', hide)
  window.addEventListener(
    'mousemove',
    (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      // The chip it belongs to may have been drawn again: off every chip, the tooltip goes.
      if (tip && !(event.target instanceof Element && event.target.closest('[data-chip-tip]')))
        hide()
    },
    { capture: true, passive: true },
  )
}

function show(chip: HTMLElement, build: () => HTMLElement | null): void {
  hide()
  if (!chip.isConnected) return
  const content = build()
  if (!content) return
  const el = document.createElement('div')
  el.className = 'cm-chip-tooltip'
  el.setAttribute('role', 'tooltip')
  el.id = 'cm-chip-tooltip'
  el.append(content)
  document.body.append(el)
  const chipBox = chip.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const left = Math.min(
    Math.max(MARGIN, chipBox.left + chipBox.width / 2 - box.width / 2),
    Math.max(MARGIN, window.innerWidth - box.width - MARGIN),
  )
  // Under the chip, or above it when there is no room below.
  const below = chipBox.bottom + GAP
  const top =
    below + box.height + MARGIN > window.innerHeight
      ? Math.max(MARGIN, chipBox.top - GAP - box.height)
      : below
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  chip.setAttribute('aria-describedby', el.id)
  tip = el
  owner = chip
}

/** Shows `build()` under `chip` while the pointer rests on it. `build` may return null for nothing to show. */
export function attachChipTooltip(chip: HTMLElement, build: () => HTMLElement | null): void {
  listen()
  builders.set(chip, build)
  chip.dataset['chipTip'] = ''
  chip.addEventListener('mouseenter', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      // The chip under the pointer now: this one, the one drawn in its place, or none when the
      // text scrolled it away.
      const target = chipAt(pointer.x, pointer.y)
      const builder = target && builders.get(target)
      if (target && builder) show(target, builder)
      else hide()
    }, DELAY_MS)
  })
  chip.addEventListener('mouseleave', () => {
    if (owner === chip || timer !== undefined) hide()
  })
}

/** A line of the tooltip, with a class for its look. */
export function tipLine(className: string, text: string): HTMLElement {
  const line = document.createElement('div')
  line.className = className
  line.textContent = text
  return line
}
