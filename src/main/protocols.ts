import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { buildCsp } from './security/csp'
import { isInside } from './security/paths'

export const APP_SCHEME = 'app'
export const APP_HOST = 'renderer'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`
export const ASSET_SCHEME = 'project-asset'

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

/** Must run before the app is ready. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ])
}

const notFound = (): Response => new Response('Not found', { status: 404 })

/** Serves the built renderer from `app://renderer/`, so the UI never loads from file URLs. The
 * HTML document gets the CSP header and a fresh nonce for every load. */
export function handleAppProtocol(rendererRoot: string): void {
  const root = resolve(rendererRoot)
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== APP_HOST) return notFound()
      const pathname = decodeURIComponent(url.pathname)
      const file = resolve(join(root, pathname === '/' ? 'index.html' : pathname))
      if (!isInside(root, file)) return new Response('Forbidden', { status: 403 })

      if (extname(file) === '.html') {
        const nonce = randomBytes(16).toString('base64')
        const html = (await readFile(file, 'utf8')).replaceAll('__CSP_NONCE__', nonce)
        return new Response(html, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': buildCsp({ nonce }),
          },
        })
      }
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return notFound()
    }
  })
}

/** Serves images from the open project's folder as `project-asset://project/<relative path>`.
 * Anything that resolves outside the project root is rejected. With no project open, nothing is
 * served. */
export function handleAssetProtocol(getProjectRoot: () => string | null): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const projectRoot = getProjectRoot()
      if (!projectRoot) return notFound()
      const root = resolve(projectRoot)
      const file = resolve(join(root, decodeURIComponent(new URL(request.url).pathname)))
      if (!isInside(root, file) || !IMAGE_TYPES.has(extname(file).toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return notFound()
    }
  })
}
