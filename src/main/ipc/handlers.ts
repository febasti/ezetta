import type { ItemSettings } from '@core/project/manifest'
import type { Handlers } from '@shared/ipc'
import type { AppMenu, MenuSpecItem } from '@shared/menu'
import type { LookupRequest, LookupResult } from '@core/thesaurus/lookup'
import { IpcFailure } from '@shared/ipc'
import { isAllowedExternalUrl } from '../security/external'
import { unwrap } from '../services/projectHost'
import type { ProjectHost } from '../services/projectHost'
import { parseDictionary } from '@core/proof/issues'
import type { MathRenderer } from '../services/mathRenderer'
import type { ProofService } from '../services/languageTool'
import type { SettingsStore } from '../services/settings'
import type { createExporter } from '../services/exporter'
import type { createTemplateStore } from '../services/templateStore'

export interface HandlerDeps {
  host: ProjectHost
  settings: SettingsStore
  math: MathRenderer
  proof: ProofService
  exporter: ReturnType<typeof createExporter>
  templates: ReturnType<typeof createTemplateStore>
  synonyms: (request: LookupRequest) => Promise<LookupResult>
  /** Called when the renderer reports that unsaved text was written. */
  flushDone: () => void
  openExternal: (url: string) => Promise<void>
  /** Shows a file in the system's file manager. */
  reveal: (absPath: string) => void
  /** How the window is framed (macOS: the title bar merged with the toolbar). */
  windowChrome: () => { inset: boolean; fullscreen: boolean }
  /** Shows a native menu at a place in the window; null when the app draws its own menus. */
  popupMenu: (
    items: readonly MenuSpecItem[],
    at: { x: number; y: number },
  ) => Promise<{ native: boolean; id: string | null }>
  /** Sets the menu bar from the renderer's description (macOS only). */
  setMenu: (menu: AppMenu) => void
  /** The app's version and the text of its third-party notices. */
  about: () => Promise<{ version: string; notices: string }>
  /** The app's theme changed (or is told at the start). */
  setAppearance: (theme: 'light' | 'dark' | 'sepia') => void
  /** The window is the launcher (no project open) or a project's window. */
  setWindowMode: (launcher: boolean) => void
}

/** Thin adapters: map validated requests onto core and services. No business rules here. */
export function createHandlers({
  host,
  settings,
  math,
  proof,
  exporter,
  templates,
  synonyms,
  flushDone,
  openExternal,
  reveal,
  popupMenu,
  setMenu,
  about,
  setAppearance,
  setWindowMode,
  windowChrome,
}: HandlerDeps): Handlers {
  const snapshotOrThrow = () => {
    const snapshot = host.snapshot()
    if (!snapshot) throw new IpcFailure('no_project', 'No project is open')
    return snapshot
  }

  const dictionaryWords = async () => ({
    personal: [...settings.personalWords()],
    project: host.root ? parseDictionary(await host.session().readDictionary()) : [],
  })

  return {
    app: {
      openExternal: async ({ url }) => {
        if (!isAllowedExternalUrl(url))
          throw new IpcFailure('forbidden', 'This address cannot be opened')
        await openExternal(url)
        return {}
      },
      popupMenu: ({ items, x, y }) => popupMenu(items, { x, y }),
      setMenu: (menu) => {
        setMenu(menu)
        return {}
      },
      setAppearance: ({ theme }) => {
        setAppearance(theme)
        return {}
      },
      setWindowMode: ({ launcher }) => {
        setWindowMode(launcher)
        return {}
      },
      about: () => about(),
      launchBehavior: () => ({ reopenLast: settings.reopensLastProject() }),
      setLaunchBehavior: async ({ reopenLast }) => {
        await settings.setReopenLastProject(reopenLast)
        return {}
      },
      windowChrome: () => windowChrome(),
      flushDone: () => {
        flushDone()
        return {}
      },
    },
    project: {
      current: () => ({ snapshot: host.snapshot() }),
      create: async ({ language, dialogTitle }) => ({
        snapshot: await host.pickAndCreate(language, dialogTitle),
      }),
      open: async ({ dialogTitle }) => ({ snapshot: await host.pickAndOpen(dialogTitle) }),
      openRecent: async ({ path }) => ({ snapshot: await host.openPath(path) }),
      close: async () => {
        await host.close()
        return {}
      },
      recent: () => ({ projects: [...settings.recentProjects()] }),
      createSheet: async ({ parent, name }) => {
        const { path } = unwrap(await host.session().createSheet(parent, name))
        return { path, snapshot: snapshotOrThrow() }
      },
      createGroup: async ({ parent, name }) => {
        const { path } = unwrap(await host.session().createGroup(parent, name))
        return { path, snapshot: snapshotOrThrow() }
      },
      rename: async ({ path, name }) => {
        const result = unwrap(await host.session().rename(path, name))
        return { path: result.path, snapshot: snapshotOrThrow() }
      },
      move: async ({ path, toParent, index }) => {
        const result = unwrap(await host.session().move(path, toParent, index))
        return { path: result.path, snapshot: snapshotOrThrow() }
      },
      remove: async ({ path }) => {
        unwrap(await host.session().remove(path))
        return { snapshot: snapshotOrThrow() }
      },
      setItem: async ({ path, ...patch }) => {
        const settingsPatch: Partial<
          Pick<ItemSettings, 'status' | 'goal' | 'export' | 'icon' | 'color'>
        > = {}
        if ('status' in patch) settingsPatch.status = patch.status ?? undefined
        if ('goal' in patch) settingsPatch.goal = patch.goal ?? undefined
        if ('export' in patch) settingsPatch.export = patch.export ?? undefined
        if ('icon' in patch) settingsPatch.icon = patch.icon ?? undefined
        if ('color' in patch) settingsPatch.color = patch.color ?? undefined
        unwrap(await host.session().setItem(path, settingsPatch))
        return { snapshot: snapshotOrThrow() }
      },
      setTitle: async ({ title }) => {
        unwrap(await host.session().setProjectTitle(title))
        const snapshot = snapshotOrThrow()
        if (host.root) await settings.addRecent({ path: host.root, title: snapshot.title })
        return { snapshot }
      },
      setQuoteBlockMarks: async ({ blockMarks }) => {
        unwrap(await host.session().setQuoteBlockMarks(blockMarks))
        return { snapshot: snapshotOrThrow() }
      },
      setQuoteStyle: async ({ style }) => {
        unwrap(await host.session().setQuoteStyle(style))
        return { snapshot: snapshotOrThrow() }
      },
      setProofing: async (patch) => {
        unwrap(await host.session().setProofing(patch))
        return { snapshot: snapshotOrThrow() }
      },
      setFootnoteRestart: async ({ restart }) => {
        unwrap(await host.session().setFootnoteRestart(restart))
        return { snapshot: snapshotOrThrow() }
      },
      removeMissing: async ({ path }) => {
        unwrap(await host.session().removeMissing(path))
        return { snapshot: snapshotOrThrow() }
      },
      relink: async ({ missingPath, targetPath }) => {
        unwrap(await host.session().relink(missingPath, targetPath))
        return { snapshot: snapshotOrThrow() }
      },
      readSheet: async ({ path }) => ({ content: unwrap(await host.session().readSheet(path)) }),
      readSheets: async ({ paths }) => ({ sheets: unwrap(await host.session().readSheets(paths)) }),
      chooseImage: async ({ dialogTitle, filterName }) => ({
        path: await host.chooseImage(dialogTitle, filterName),
      }),
      chooseBibliography: async ({ dialogTitle, filterName }) => ({
        snapshot: await host.chooseBibliography(dialogTitle, filterName),
      }),
      readBibliography: () => host.session().library(),
      renderMath: ({ source, display }) => math.render(source, display),
      addImage: async ({ name, data }) => unwrap(await host.session().addAsset(name, data)),
      writeSheet: async ({ path, content }) => {
        const { words, footnoteWords } = unwrap(await host.session().writeSheet(path, content))
        return { words, footnoteWords }
      },
    },
    export: {
      info: () => exporter.info(),
      numbering: async () => {
        const { numbering, supplements, captionSeparator } = await exporter.numbering()
        return {
          formats: [...numbering.formats],
          depth: numbering.depth,
          separator: numbering.separator,
          supplements: { ...supplements },
          captionSeparator,
        }
      },
      // The project as it is when a PDF is made is kept as a version.
      preview: ({ profile }) => exporter.preview(profile),
      saveProfile: async ({ profile }) => {
        await exporter.saveProfile(profile)
        return {}
      },
      thumbnail: ({ template, language }) => exporter.thumbnail(template, language),
      run: async (request) => {
        await host.takeVersion('export')
        return exporter.run(request)
      },
    },
    templates: {
      list: () => templates.list(),
      get: ({ id }) => templates.get(id),
      create: async ({ baseId, name }) => ({ id: await templates.create(baseId, name) }),
      rename: async ({ id, name }) => {
        await templates.rename(id, name)
        return {}
      },
      remove: async ({ id }) => {
        await templates.remove(id)
        return {}
      },
      exportFile: async ({ id, dialogTitle, filterName, fileName }) => ({
        path: await templates.exportFile(id, dialogTitle, filterName, fileName),
      }),
      importFile: async ({ dialogTitle, filterName }) => ({
        id: await templates.importFile(dialogTitle, filterName),
      }),
      addFonts: ({ id, dialogTitle, filterName }) =>
        templates.addFonts(id, dialogTitle, filterName),
      removeFont: ({ id, file }) => templates.removeFont(id, file),
      setOption: async ({ id, option, default: value, hidden }) => ({
        options: await templates.setOption(id, option, {
          ...(value !== undefined ? { default: value } : {}),
          ...(hidden !== undefined ? { hidden } : {}),
        }),
      }),
      set: async ({ id, element, prop, value }) => ({
        overrides: await templates.set(id, element, prop, value),
      }),
    },
    history: {
      list: ({ limit }) => host.versions(limit),
      files: ({ id }) => host.versionFiles(id),
      compare: ({ id, path }) => host.compareVersion(id, path),
      save: async ({ name }) => ({ version: await host.takeVersion('named', name) }),
      restore: async ({ id, path }) => ({ snapshot: await host.restoreVersion(id, path) }),
      restoreAll: ({ id, removeNew }) => host.restoreAllFromVersion(id, removeNew),
      setEnabled: async ({ enabled }) => ({ snapshot: await host.setHistoryEnabled(enabled) }),
    },
    backup: {
      status: () => host.backupStatus(),
      chooseFolder: async ({ dialogTitle }) => ({
        ...(await host.chooseBackupFolder(dialogTitle)),
        status: await host.backupStatus(),
      }),
      disable: async () => {
        await host.disableBackup()
        return host.backupStatus()
      },
      run: async () => {
        const result = await host.runBackup(true)
        return { result, status: await host.backupStatus() }
      },
      list: async () => ({ files: await host.backups() }),
      restore: async ({ name, dialogTitle }) => {
        const snapshot = await host.restoreBackupByName(name, dialogTitle)
        return { snapshot, path: snapshot ? host.root : null }
      },
      restoreFile: async ({ fileDialogTitle, filterName, folderDialogTitle }) => {
        const snapshot = await host.restoreBackupFromFile(
          fileDialogTitle,
          filterName,
          folderDialogTitle,
        )
        return { snapshot, path: snapshot ? host.root : null }
      },
      reveal: async ({ name }) => {
        reveal(await host.backupPath(name))
        return {}
      },
    },
    thesaurus: {
      synonyms: (request) => synonyms(request),
    },
    proof: {
      start: async () => ({ state: await proof.start() }),
      check: (request) => proof.check(request),
      words: () => dictionaryWords(),
      addWord: async ({ scope, word }) => {
        if (scope === 'personal') await settings.addPersonalWord(word)
        else unwrap(await host.session().addDictionaryWord(word))
        return dictionaryWords()
      },
    },
  }
}
