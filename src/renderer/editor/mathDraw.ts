import type { MathOutcome } from './mathState'

/** Shows a formula's drawing (or what to show instead) inside `dom`. Plain DOM, shared by the widget and the popover. */

/** The drawing as an element, sized in em so it follows the text size around it. */
function svgElement(
  outcome: Extract<MathOutcome, { ok: true }>,
  inline: boolean,
): SVGElement | null {
  const parsed = new DOMParser().parseFromString(outcome.svg, 'image/svg+xml')
  const root = parsed.documentElement
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) return null
  const svg = document.importNode(root, true) as unknown as SVGElement
  svg.setAttribute('width', `${outcome.width}em`)
  svg.setAttribute('height', `${outcome.height}em`)
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('cm-math-svg')
  // The baseline of an inline formula sits on the baseline of the text.
  if (inline)
    svg.style.verticalAlign =
      outcome.baseline === null ? 'middle' : `${-(outcome.height - outcome.baseline)}em`
  return svg
}

/** Nothing to draw yet: the source, dimmed, until the drawing arrives. */
export function drawSource(dom: HTMLElement, source: string, className = 'cm-math-source'): void {
  const text = document.createElement('span')
  text.className = className
  text.textContent = source
  dom.replaceChildren(text)
}

export function drawEmpty(dom: HTMLElement, label: string): void {
  const pill = document.createElement('span')
  pill.className = 'cm-math-empty'
  pill.textContent = label
  dom.replaceChildren(pill)
  dom.classList.remove('invalid')
  dom.removeAttribute('title')
}

/**
 * Draws the outcome. A formula that does not compile keeps showing its last good drawing, marked
 * as invalid with the message as a tooltip, so typing does not make the formula flicker; with no
 * earlier drawing it shows its source instead.
 */
export function drawOutcome(
  dom: HTMLElement,
  outcome: MathOutcome,
  options: { source: string; inline: boolean },
): void {
  if (outcome.ok) {
    const svg = svgElement(outcome, options.inline)
    if (svg) {
      dom.replaceChildren(svg)
      dom.classList.remove('invalid', 'unavailable')
      dom.removeAttribute('title')
      return
    }
  }
  const message = outcome.ok ? '' : outcome.message
  if (!dom.querySelector('svg')) drawSource(dom, options.source)
  dom.classList.add(!outcome.ok && outcome.reason === 'unavailable' ? 'unavailable' : 'invalid')
  if (message) dom.title = message
}
