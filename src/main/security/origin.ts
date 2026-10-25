/** Origin checks for IPC senders. Node's `URL.origin` is the string "null" for custom schemes, so
 * the origin is built by hand. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

export function isTrustedUrl(
  url: string | null | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (!url) return false
  const origin = originOf(url)
  return origin !== null && trustedOrigins.includes(origin)
}
