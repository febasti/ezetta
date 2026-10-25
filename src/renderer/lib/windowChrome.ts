/**
 * The window's frame: on macOS the title bar is merged with the toolbar, so the page must
 * leave the traffic lights room and let the toolbar's empty space move the window. The root element
 * carries it as `data-chrome="inset"` and, in full screen (no traffic lights), `data-fullscreen`.
 */
export function initWindowChrome(): void {
  const root = document.documentElement
  const apply = ({ inset, fullscreen }: { inset: boolean; fullscreen: boolean }): void => {
    root.dataset['chrome'] = inset ? 'inset' : 'native'
    root.dataset['fullscreen'] = String(fullscreen)
  }
  // Not through `call`: a frame that cannot be asked for keeps the native look, without a message.
  void window.api.app.windowChrome({}).then((result) => {
    if (result.ok) apply(result.value)
  })
  window.api.on.app.windowChromeChanged(apply)
}
