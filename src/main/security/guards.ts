import { app, session, shell } from 'electron'
import type { WebContents } from 'electron'
import { buildCsp } from './csp'
import { isAllowedExternalUrl } from './external'
import { isTrustedUrl } from './origin'

/** Process-wide hardening: no new windows, no navigation away from the app, no webviews,
 * no permissions, Chromium spell-check off (LanguageTool replaces it). */
export function installGuards(
  trustedOrigins: readonly string[],
  devOrigin: string | undefined,
): void {
  const openExternal = (url: string): void => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
  }

  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (isTrustedUrl(url, trustedOrigins)) return
      event.preventDefault()
      openExternal(url)
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.setSpellCheckerEnabled(false)

  if (devOrigin) {
    // In development the document comes from the Vite dev server, not from our protocol handler.
    ses.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [buildCsp({ nonce: '', devOrigin })],
        },
      })
    })
  }
}
