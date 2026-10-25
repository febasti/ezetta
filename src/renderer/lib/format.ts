/** Number formatting follows the UI language: 2.140 in German, 2,140 in English. */
export const formatNumber = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(value)

/** "vor 5 Minuten", "vor 2 Stunden", "gestern": how long ago a time was, or null for the last minute. */
export function relativeTime(time: number, now: number, locale: string): string | null {
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return null
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.floor(hours / 24), 'day')
}
