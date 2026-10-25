/** Up and down arrows move focus between rows that carry `data-row` inside the same column. */
export function rowNavigation(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const column = (event.currentTarget as HTMLElement).closest('[data-rows]')
  if (!column) return
  const rows = [...column.querySelectorAll<HTMLElement>('[data-row]')]
  const at = rows.indexOf(event.currentTarget as HTMLElement)
  const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)]
  if (next) {
    next.focus()
    event.preventDefault()
  }
}
