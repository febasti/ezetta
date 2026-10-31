import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { APP_INDEX_URL } from './protocols'
import type { AppTheme, WindowState } from './services/settings'
import { LAUNCHER_SIZE, MIN_SIZE, placeWindow } from './windowState'

/** Whether a window is the small launcher (no project open), by window. */
const launchers = new WeakMap<BrowserWindow, boolean>()

/**
 * Makes the window the small fixed launcher of the welcome page, or the window of a project again:
 * its saved size and place, resizable, maximizable. While it is the launcher its size and place are
 * not kept, so the project window opens as it was.
 */
export function setLauncherMode(
  window: BrowserWindow,
  launcher: boolean,
  saved: WindowState | null,
): void {
  if (window.isDestroyed() || launchers.get(window) === launcher) return
  launchers.set(window, launcher)
  if (launcher) {
    if (window.isFullScreen()) window.setFullScreen(false)
    if (window.isMaximized()) window.unmaximize()
    window.setResizable(true)
    window.setMinimumSize(LAUNCHER_SIZE.width, LAUNCHER_SIZE.height)
    window.setContentSize(LAUNCHER_SIZE.width, LAUNCHER_SIZE.height)
    window.setResizable(false)
    window.setMaximizable(false)
    window.setFullScreenable(false)
    window.center()
  } else {
    window.setFullScreenable(true)
    window.setMaximizable(true)
    window.setResizable(true)
    window.setMinimumSize(MIN_SIZE.width, MIN_SIZE.height)
    const place = placeWindow(
      saved,
      screen.getAllDisplays().map((display) => display.workArea),
    )
    window.setBounds(place.bounds)
    if (place.bounds.x === undefined) window.center()
    launchers.set(window, launcher)
    if (place.maximized && !launcher) window.maximize()
  }
}

export interface WindowHooks {
  /** Resolves once the renderer has written unsaved text. Called before the window closes. */
  requestFlush: (window: BrowserWindow) => Promise<void>
  /** False while the app is quitting: the quit sequence has already flushed. */
  shouldFlushOnClose: () => boolean
  /** The window entered or left full screen. */
  onFullScreen?: (fullscreen: boolean) => void
  /** Where the window is, after it moved or changed size and as it closes, to open it there next time. */
  onPlaced?: (state: WindowState) => void
}

/**
 * On macOS the title bar is merged with the toolbar: the window has no title bar of its own, and the
 * traffic lights sit at the left of the toolbar, centred in its height (48 px; the page leaves them
 * room). Windows and Linux keep the native title bar.
 */
export const insetTitleBar = (platform: NodeJS.Platform): boolean => platform === 'darwin'
// The lights are 14 pt circles on current macOS (12 pt before macOS 26): 17 pt down puts their
// middle at 24 pt, the middle of the toolbar's 48 pt, where the toolbar's buttons are centred.
const TRAFFIC_LIGHTS = { x: 18, y: 17 }

/** The window's colour before the page paints, by the theme last chosen (the page's `--surface-2`). */
const WINDOW_BACKGROUND: Record<AppTheme, string> = {
  light: '#ffffff',
  dark: '#1f1f1e',
  sepia: '#fbf6ea',
}

/**
 * Test runs open many windows; `EZETTA_BACKGROUND=1` (development builds only, set by the
 * end-to-end helpers) keeps them out of the way. The tests drive the page through the debugger,
 * so a window that takes the focus would only get in the way: the window it takes it from loses a
 * hover's tooltip in the middle of a test. On macOS the windows are never shown, since a pointer
 * passing over one reaches the page (macOS delivers it even to a window that ignores mouse
 * events). On Windows and Linux they are shown without the focus: Windows draws no frames for a
 * window that was never shown, and a test that waits for one never ends. The page keeps running
 * (see the switches in `index.ts`).
 */
export function createMainWindow(
  devUrl: string | undefined,
  hooks: WindowHooks,
  options: {
    background?: boolean
    saved?: WindowState | null
    theme?: AppTheme | null
    /** No project is open: the window starts as the small launcher. */
    launcher?: boolean
  } = {},
): BrowserWindow {
  const place = placeWindow(
    options.saved ?? null,
    screen.getAllDisplays().map((display) => display.workArea),
  )
  const launcher = options.launcher === true
  const window = new BrowserWindow({
    ...(launcher ? { ...LAUNCHER_SIZE, useContentSize: true } : place.bounds),
    minWidth: launcher ? LAUNCHER_SIZE.width : MIN_SIZE.width,
    minHeight: launcher ? LAUNCHER_SIZE.height : MIN_SIZE.height,
    ...(launcher ? { resizable: false, maximizable: false, fullscreenable: false } : {}),
    show: false,
    backgroundColor: WINDOW_BACKGROUND[options.theme ?? 'light'],
    ...(insetTitleBar(process.platform)
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: TRAFFIC_LIGHTS }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      // Test runs keep their windows drawing while they are covered (see `background` above).
      backgroundThrottling: !options.background,
    },
  })

  if (place.maximized) window.maximize()

  // Its place is kept for the next start (the size it has when not maximized or in full screen):
  // a moment after it moved or changed size, so a quit does not have to wait for it, and on close.
  const keepPlace = (): void => {
    if (window.isDestroyed() || window.isFullScreen() || launchers.get(window)) return
    const { x, y, width, height } = window.getNormalBounds()
    hooks.onPlaced?.({ x, y, width, height, maximized: window.isMaximized() })
  }
  let placing: ReturnType<typeof setTimeout> | undefined
  const keepPlaceSoon = (): void => {
    clearTimeout(placing)
    placing = setTimeout(keepPlace, 400)
  }
  window.on('move', keepPlaceSoon)
  window.on('resize', keepPlaceSoon)
  window.on('maximize', keepPlaceSoon)
  window.on('unmaximize', keepPlaceSoon)

  // Never lose typed text: ask the renderer to save before the window really closes.
  let flushed = false
  window.on('close', (event) => {
    clearTimeout(placing)
    keepPlace()
    if (flushed || !hooks.shouldFlushOnClose()) return
    event.preventDefault()
    void hooks.requestFlush(window).finally(() => {
      flushed = true
      if (!window.isDestroyed()) window.close()
    })
  })

  window.on('enter-full-screen', () => hooks.onFullScreen?.(true))
  window.on('leave-full-screen', () => hooks.onFullScreen?.(false))

  if (!options.background) window.once('ready-to-show', () => window.show())
  else if (process.platform !== 'darwin') window.once('ready-to-show', () => window.showInactive())
  void window.loadURL(devUrl ?? APP_INDEX_URL)
  return window
}
