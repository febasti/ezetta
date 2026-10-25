const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])

/** External links open in the system browser, for https and mailto only. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
