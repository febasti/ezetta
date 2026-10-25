/** Content Security Policy: same-origin scripts and styles only, no inline script, no
 * eval. The nonce exists for CodeMirror, which injects <style> elements at runtime and reads the
 * nonce from the page (`EditorView.cspNonce`). */
export function buildCsp(options: { nonce: string; devOrigin?: string | undefined }): string {
  const { nonce, devOrigin } = options
  if (devOrigin) {
    // The Vite dev server injects styles from JavaScript and needs a websocket for hot reload.
    const ws = devOrigin.replace(/^http/, 'ws')
    return [
      `default-src 'none'`,
      `script-src 'self'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: project-asset:`,
      `font-src 'self'`,
      `connect-src 'self' ${ws}`,
      `base-uri 'none'`,
      `form-action 'none'`,
      `object-src 'none'`,
    ].join('; ')
  }
  return [
    `default-src 'none'`,
    `script-src 'self'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: project-asset:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
  ].join('; ')
}
