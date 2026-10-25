// A bare Electron window for the gallery's screenshot tests: it shows the built gallery
// (`out-gallery/gallery.html`, made by `npm run test:gallery`) in the app's own Chromium, so the
// pictures are what the app draws. Nothing of the app runs here, and the page has no privileges.
// `npm run gallery:app` shows the window, to look at the gallery in the app's Chromium by hand.
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1200,
    height: 900,
    show: process.env['GALLERY_SHOW'] === '1',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  void window.loadFile(fileURLToPath(new URL('../../out-gallery/gallery.html', import.meta.url)))
})
