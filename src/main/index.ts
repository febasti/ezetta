import { readFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { events } from '@shared/ipc'
import { sendEvent } from './ipc/events'
import { createMathRenderer, findTypst, spawnTypst } from './services/mathRenderer'
import {
  attachedServer,
  createLanguageTool,
  findInstallation,
  freePort,
  launchServer,
} from './services/languageTool'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { installApplicationMenu, setApplicationMenu } from './menu'
import { popupNativeMenu } from './services/nativeMenu'
import {
  compilerAvailable,
  createExporter,
  listFontFamilies,
  spawnCompiler,
} from './services/exporter'
import { createTemplateStore } from './services/templateStore'
import { createMorph, launchMorph, prepareMorph } from './services/morph'
import { createThesaurusStore } from './services/thesaurus'
import { lookupSynonyms } from '@core/thesaurus/lookup'
import { APP_ORIGIN, handleAppProtocol, handleAssetProtocol, registerSchemes } from './protocols'
import { installGuards } from './security/guards'
import { originOf } from './security/origin'
import { ProjectHost } from './services/projectHost'
import { SettingsStore } from './services/settings'
import { createMainWindow, insetTitleBar, setLauncherMode } from './window'

// Chromium sandbox on for every renderer, in every build.
app.enableSandbox()
registerSchemes()

/** A variable of the environment, read only in development and tests; empty counts as unset. */
const devEnv = (name: string): string | undefined =>
  app.isPackaged ? undefined : process.env[name] || undefined

/** A folder the packaged app ships in its resources, and a checkout has at `dev`. */
const resourceDir = (name: string, dev = name): string =>
  app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), dev)

const devUrl = devEnv('ELECTRON_RENDERER_URL')
const devOrigin = devUrl ? (originOf(devUrl) ?? undefined) : undefined
const trustedOrigins = devOrigin ? [APP_ORIGIN, devOrigin] : [APP_ORIGIN]

const log = (message: string, cause?: unknown): void =>
  console.error(`[main] ${message}`, cause ?? '')

let mainWindow: BrowserWindow | undefined
/** The window's page, while there is one: a closed window's `webContents` throws when read. */
const contents = (): Electron.WebContents | undefined =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined
let resolveFlush: (() => void) | null = null
/** Set once the quit sequence has written unsaved text, so quitting can go ahead. */
let quitFlushed = false

/** Asks the renderer to write unsaved text, and waits for its answer (at most a few seconds). */
function requestFlush(window: BrowserWindow): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000)
    resolveFlush = () => {
      clearTimeout(timer)
      resolve()
    }
    sendEvent(window.webContents, events.app.flushRequested, {})
  })
}

/** The window a dialog belongs to, while there is one. */
const dialogParent = (): BrowserWindow | undefined =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined

/**
 * The system's open dialog. Tests cannot click a system dialog, so in development the answer can
 * be named by the environment variable `preset` instead (several paths separated as in PATH).
 */
async function openPaths(options: Electron.OpenDialogOptions, preset?: string): Promise<string[]> {
  const named = preset ? devEnv(preset) : undefined
  if (named) return named.split(delimiter).filter((path) => path !== '')
  const parent = dialogParent()
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

async function openPath(
  options: Electron.OpenDialogOptions,
  preset?: string,
): Promise<string | null> {
  const named = preset ? devEnv(preset) : undefined
  if (named) return named
  return (await openPaths(options))[0] ?? null
}

/** The system's save dialog, with the same `preset` as `openPaths`. */
async function savePath(
  options: Electron.SaveDialogOptions,
  preset?: string,
): Promise<string | null> {
  const named = preset ? devEnv(preset) : undefined
  if (named) return named
  const parent = dialogParent()
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  return result.canceled ? null : (result.filePath ?? null)
}

const folder = (title: string): Electron.OpenDialogOptions => ({
  title,
  properties: ['openDirectory', 'createDirectory'],
})
const file = (title: string, name: string, extensions: string[]): Electron.OpenDialogOptions => ({
  title,
  properties: ['openFile'],
  filters: [{ name, extensions }],
})

/** Development only: windows of test runs never take the focus (see `createMainWindow`). */
const background = devEnv('EZETTA_BACKGROUND') === '1'
// On macOS the app itself would otherwise come to the front when it starts.
if (background && process.platform === 'darwin') app.setActivationPolicy('accessory')
// A window that is not shown must keep drawing: the tests wait for frames, and Chromium would
// otherwise stop painting a window that is hidden, covered or inactive.
if (background) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

void app.whenReady().then(async () => {
  const settings = new SettingsStore(app.getPath('userData'))
  await settings.load()

  const host = new ProjectHost({
    settings,
    trashItem: (absPath) => shell.trashItem(absPath),
    pickFolderToOpen: (title) => openPath(folder(title)),
    pickNewProjectPath: (title) =>
      savePath({ title, properties: ['createDirectory', 'showOverwriteConfirmation'] }),
    pickImageFile: (title, filterName) =>
      openPath(
        file(title, filterName, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']),
        'EZETTA_TEST_IMAGE',
      ),
    pickBackupFolder: (title) => openPath(folder(title), 'EZETTA_TEST_BACKUP'),
    pickBackupFile: (title, filterName) =>
      openPath(file(title, filterName, ['zip']), 'EZETTA_TEST_RESTORE_ZIP'),
    pickRestoreFolder: (title) => openPath(folder(title), 'EZETTA_TEST_RESTORE_TO'),
    pickBibliographyFile: (title, filterName) =>
      openPath(file(title, filterName, ['bib', 'bibtex']), 'EZETTA_TEST_BIB'),
    emitChanged: (payload) => sendEvent(contents(), events.project.changed, payload),
    emitBackup: (status) => sendEvent(contents(), events.backup.changed, status),
    log,
  })

  installApplicationMenu(process.platform, () =>
    sendEvent(contents(), events.app.settingsRequested, {}),
  )
  installGuards(trustedOrigins, devOrigin)
  handleAppProtocol(join(__dirname, '../renderer'))
  handleAssetProtocol(() => host.root)
  const resourcesPath = app.isPackaged ? process.resourcesPath : undefined
  // Typst draws the formulas in the editor and compiles the export, in the project's folder.
  const typstBinary = findTypst({ resourcesPath, override: devEnv('EZETTA_TYPST') })
  const math = createMathRenderer(spawnTypst(typstBinary))
  // LanguageTool runs as a local child process, started when the first check asks for it.
  // Development and tests can name the port of one that already runs on this machine.
  const runningPort = Number(devEnv('EZETTA_LANGUAGETOOL_PORT')) || 0
  // Development and tests can shorten the idle time, to see the servers stop.
  const idleStopMs = Number(devEnv('EZETTA_PROOF_IDLE_MS')) || undefined
  const findLanguageTool = () =>
    findInstallation({
      resourcesPath,
      appPath: app.isPackaged ? undefined : app.getAppPath(),
      home: devEnv('EZETTA_LANGUAGETOOL'),
      java: devEnv('EZETTA_JAVA'),
    })
  const proof = createLanguageTool({
    find: findLanguageTool,
    launch: launchServer,
    freePort,
    ...(runningPort > 0 ? attachedServer(runningPort) : {}),
    fetch,
    log,
    idleStopMs,
  })
  // Synonyms: the thesaurus files, and LanguageTool's morphology for the base form of a word and
  // the forms of its synonyms. Packaging ships both; development reads `.dev/`.
  const morphClasses = resourceDir('morph', '.dev/morph')
  const morph = createMorph({
    find: () => {
      const installation = findLanguageTool()
      return installation ? { installation, classes: morphClasses } : null
    },
    prepare: () => {
      const installation = findLanguageTool()
      return app.isPackaged || !installation
        ? Promise.resolve(Boolean(installation))
        : prepareMorph({
            source: join(app.getAppPath(), 'tools', 'morph', 'Morph.java'),
            out: morphClasses,
            installation,
          })
    },
    launch: launchMorph,
    idleStopMs,
    log,
  })
  const thesaurus = createThesaurusStore({
    dir: devEnv('EZETTA_THESAURUS') ?? resourceDir('thesaurus', '.dev/thesaurus'),
  })
  app.on('will-quit', () => morph.stop())
  const bundledTemplates = resourceDir('templates')
  // The writer's own templates belong to the app, not to a project.
  const customTemplates = join(app.getPath('userData'), 'templates')
  const templates = createTemplateStore({
    bundledDir: bundledTemplates,
    customDir: customTemplates,
    trash: (absPath) => shell.trashItem(absPath),
    pickFonts: (title, filterName) =>
      openPaths(
        {
          ...file(title, filterName, ['ttf', 'otf', 'ttc', 'otc']),
          properties: ['openFile', 'multiSelections'],
        },
        'EZETTA_TEST_FONTS',
      ),
    pickSavePath: (title, filterName, fileName) =>
      savePath(
        {
          title,
          defaultPath: fileName,
          filters: [{ name: filterName, extensions: ['ezetta-template'] }],
        },
        'EZETTA_TEST_TEMPLATE_EXPORT',
      ),
    pickTemplateFile: (title, filterName) =>
      openPath(file(title, filterName, ['ezetta-template']), 'EZETTA_TEST_TEMPLATE_IMPORT'),
    families: (fontsDir) => listFontFamilies(typstBinary, fontsDir),
  })
  const exporter = createExporter({
    host,
    templatesDir: bundledTemplates,
    customTemplatesDir: customTemplates,
    compiler: spawnCompiler(typstBinary),
    available: () => compilerAvailable(typstBinary),
    pickSavePath: (title, filterName, fileName) =>
      savePath(
        { title, defaultPath: fileName, filters: [{ name: filterName, extensions: ['pdf'] }] },
        'EZETTA_TEST_EXPORT',
      ),
    log,
  })
  proof.onState((state) => sendEvent(contents(), events.proof.statusChanged, { state }))
  app.on('will-quit', () => void proof.stop())
  registerIpc(
    createHandlers({
      host,
      settings,
      math,
      proof,
      exporter,
      templates,
      synonyms: (request) => lookupSynonyms({ morph, thesaurus }, request),
      flushDone: () => resolveFlush?.(),
      openExternal: (url) => shell.openExternal(url),
      reveal: (absPath) => shell.showItemInFolder(absPath),
      about: async () => ({
        version: app.getVersion(),
        notices: await readFile(resourceDir('THIRD-PARTY-NOTICES.txt'), 'utf8').catch(() => ''),
      }),
      windowChrome: () => ({
        inset: insetTitleBar(process.platform),
        fullscreen: !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen(),
      }),
      setWindowMode: (launcher) => {
        if (mainWindow) setLauncherMode(mainWindow, launcher, settings.windowState())
      },
      setAppearance: (theme) => {
        // The window's own parts (the traffic lights, the native menus) follow the app's theme.
        nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
        void settings.setAppTheme(theme).catch((cause) => log('could not save the theme', cause))
      },
      popupMenu: async (items, at) => {
        // Tests drive the page, which cannot click a system menu: they ask for the app's own.
        const own = devEnv('EZETTA_HTML_MENUS') === '1'
        if (own || !mainWindow || mainWindow.isDestroyed()) return { native: false, id: null }
        return { native: true, id: await popupNativeMenu(mainWindow, items, at) }
      },
      setMenu: (menu) =>
        setApplicationMenu(process.platform, menu, (id) =>
          sendEvent(contents(), events.app.menuCommand, { id }),
        ),
    }),
    trustedOrigins,
    log,
  )

  // Reopen the last project if the writer asked for that, so the renderer finds it open when it asks;
  // otherwise the welcome screen shows. Tests and development can name a project through the
  // environment. A missing project just leads to the welcome screen.
  const initial =
    devEnv('EZETTA_PROJECT') ??
    (settings.reopensLastProject() ? settings.recentProjects()[0]?.path : undefined)
  if (initial) await host.openPath(initial).catch((cause) => log('could not reopen project', cause))

  // The window's own parts take the theme chosen last time, before the page can say it again.
  const lastTheme = settings.appTheme()
  if (lastTheme) nativeTheme.themeSource = lastTheme === 'dark' ? 'dark' : 'light'

  const open = (): BrowserWindow =>
    (mainWindow = createMainWindow(
      devUrl,
      {
        requestFlush,
        shouldFlushOnClose: () => !quitFlushed,
        onFullScreen: (fullscreen) =>
          sendEvent(contents(), events.app.windowChromeChanged, {
            inset: insetTitleBar(process.platform),
            fullscreen,
          }),
        onPlaced: (state) =>
          void settings
            .setWindowState(state)
            .catch((cause) => log('could not save the window', cause)),
      },
      {
        background,
        saved: settings.windowState(),
        theme: settings.appTheme(),
        launcher: host.snapshot() === null,
      },
    ))
  open()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) open()
  })

  // Quitting (Cmd+Q, app.quit) must write unsaved text first. A window's own close handler cannot
  // do this: cancelling a close would also cancel the quit. So flush here, then quit again.
  app.on('before-quit', (event) => {
    if (quitFlushed) return
    event.preventDefault()
    const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    void (window ? requestFlush(window) : Promise.resolve())
      .then(() => host.close())
      .finally(() => {
        quitFlushed = true
        app.quit()
      })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
