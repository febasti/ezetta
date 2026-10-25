/**
 * The IPC contract. Every call between renderer and main is declared exactly once, here:
 * channel, request schema, response schema. From this single declaration
 *   - the preload API is generated (`buildApi`),
 *   - the main process registers and validates its handlers (`src/main/ipc`),
 *   - the renderer gets typed methods such as `window.api.project.open(...)`.
 *
 * `shared` imports nothing from the other layers. The preload bundles it, so keep it free of
 * Node and Electron APIs.
 */
import { z } from 'zod'
import {
  exportInfoSchema,
  headingNumberingSchema,
  exportPreviewSchema,
  exportRequestSchema,
  exportResultSchema,
  profileSchema,
  thumbnailSchema,
} from './export'
import {
  fontsSchema,
  optionDetailSchema,
  setsSchema,
  templateDetailSchema,
  templateEntrySchema,
  templateFileSchema,
} from './templates'
import { synonymRequestSchema, synonymResultSchema } from './thesaurus'
import { backupFileSchema, backupResultSchema, backupStatusSchema } from './backup'
import { versionFileSchema, versionSchema } from './history'
import {
  appMenuSchema,
  menuCommandSchema,
  popupMenuRequestSchema,
  popupMenuResultSchema,
} from './menu'
import { projectChangedSchema, snapshotSchema, statusSchema } from './project'
import {
  proofCheckRequestSchema,
  proofCheckResultSchema,
  proofStateSchema,
  proofWordsSchema,
} from './proof'

export const IPC_API_VERSION = 1

// ---------------------------------------------------------------------------------------------
// Results: errors cross the boundary as typed objects, never as thrown exceptions or stack traces.
// ---------------------------------------------------------------------------------------------

export type IpcErrorCode =
  | 'invalid_request'
  | 'forbidden'
  | 'internal'
  // Domain errors, thrown by handlers as `IpcFailure`:
  | 'no_project'
  | 'not_a_project'
  | 'already_a_project'
  | 'manifest_invalid'
  | 'invalid_name'
  | 'invalid_path'
  | 'invalid_move'
  | 'exists'
  | 'not_found'
  | 'not_an_image'
  | 'too_large'
  | 'not_a_bibliography'
  | 'io'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError }

/** Thrown by a handler for an expected failure. Its code and message reach the renderer as a typed
 * result; any other thrown error becomes a generic 'internal' result. */
export class IpcFailure extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (code: IpcErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})

// ---------------------------------------------------------------------------------------------
// Declaration helpers
// ---------------------------------------------------------------------------------------------

export interface InvokeDef<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  readonly channel: string
  readonly request: Req
  readonly response: Res
}

export const defineInvoke = <Req extends z.ZodType, Res extends z.ZodType>(
  channel: string,
  request: Req,
  response: Res,
): InvokeDef<Req, Res> => ({ channel, request, response })

/** A message pushed from the main process to the renderer. */
export interface EventDef<Payload extends z.ZodType = z.ZodType> {
  readonly event: string
  readonly payload: Payload
}

export const defineEvent = <Payload extends z.ZodType>(
  event: string,
  payload: Payload,
): EventDef<Payload> => ({ event, payload })

interface InvokeTree {
  readonly [key: string]: InvokeDef | InvokeTree
}
interface EventTree {
  readonly [key: string]: EventDef | EventTree
}

const isInvokeDef = (node: InvokeDef | InvokeTree): node is InvokeDef =>
  typeof node.channel === 'string'
const isEventDef = (node: EventDef | EventTree): node is EventDef => typeof node.event === 'string'

// ---------------------------------------------------------------------------------------------
// The contract. Add new methods here and nowhere else.
// ---------------------------------------------------------------------------------------------

const relPath = z.string().max(1000)
const name = z.string().max(200)
const empty = z.object({}).strict()
/** A project snapshot, or null when the writer cancelled a dialog. */
const maybeSnapshot = z.object({ snapshot: snapshotSchema.nullable() }).strict()
const withSnapshot = z.object({ snapshot: snapshotSchema }).strict()
/** A restored backup: the project that was opened and the folder it was unpacked to, or nulls if cancelled. */
const restoredSchema = z
  .object({ snapshot: snapshotSchema.nullable(), path: z.string().nullable() })
  .strict()
const withPathAndSnapshot = z.object({ path: z.string(), snapshot: snapshotSchema }).strict()
const language = z.enum(['de', 'en'])
/** The window's frame: whether the traffic lights sit in the toolbar, and whether it is full screen. */
const windowChromeSchema = z.object({ inset: z.boolean(), fullscreen: z.boolean() }).strict()
const bibName = z.object({ family: z.string(), given: z.string(), literal: z.boolean() }).strict()
/** The works of the bibliography file, and what could not be read in it. */
const bibliographySchema = z
  .object({
    entries: z.array(
      z
        .object({
          key: z.string(),
          type: z.string(),
          authors: z.array(bibName),
          editors: z.array(bibName),
          etAl: z.boolean(),
          year: z.string().nullable(),
          title: z.string().nullable(),
          container: z.string().nullable(),
          details: z
            .object({
              journal: z.string().optional(),
              booktitle: z.string().optional(),
              publisher: z.string().optional(),
              place: z.string().optional(),
              volume: z.string().optional(),
              number: z.string().optional(),
              pages: z.string().optional(),
              edition: z.string().optional(),
              school: z.string().optional(),
              doi: z.string().optional(),
              url: z.string().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    problems: z.array(z.string()),
  })
  .strict()
/**
 * The drawing of one formula, or why there is none. A formula that does not compile is not an IPC
 * failure: it comes back as data, to show next to the text field.
 */
const mathResult = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      svg: z.string().max(2_000_000),
      width: z.number(),
      height: z.number(),
      baseline: z.number().nullable(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['invalid', 'code', 'too_long', 'unavailable', 'busy']),
      message: z.string().max(2000),
      at: z.number().int().nullable().optional(),
    })
    .strict(),
])

export const ipc = {
  app: {
    /** Opens a web address in the system browser. Only https and mailto are allowed. */
    openExternal: defineInvoke(
      'app:open-external',
      z.object({ url: z.string().max(2000) }).strict(),
      empty,
    ),
    /** The renderer answers `app.flushRequested` with this once unsaved text is written. */
    flushDone: defineInvoke('app:flush-done', empty, empty),
    /** Shows a context menu as the system's own, and answers with the item chosen (null if none). */
    popupMenu: defineInvoke('app:popup-menu', popupMenuRequestSchema, popupMenuResultSchema),
    /** Sets the menu bar (macOS; elsewhere there is none). */
    setMenu: defineInvoke('app:set-menu', appMenuSchema, empty),
    /** The app's theme, for the window's own parts (traffic lights, native menus) and the next start. */
    setAppearance: defineInvoke(
      'app:set-appearance',
      z.object({ theme: z.enum(['light', 'dark', 'sepia']) }).strict(),
      empty,
    ),
    /** What the app does at the start: open the project that was open last, or show the welcome screen. */
    launchBehavior: defineInvoke(
      'app:launch-behavior',
      empty,
      z.object({ reopenLast: z.boolean() }).strict(),
    ),
    setLaunchBehavior: defineInvoke(
      'app:set-launch-behavior',
      z.object({ reopenLast: z.boolean() }).strict(),
      empty,
    ),
    /** What the About tab shows: the version, and the notices of the software shipped with the app. */
    about: defineInvoke(
      'app:about',
      empty,
      z.object({ version: z.string().max(100), notices: z.string().max(2_000_000) }).strict(),
    ),
    /** The window is the small fixed launcher while no project is open, and the project's window otherwise. */
    setWindowMode: defineInvoke(
      'app:set-window-mode',
      z.object({ launcher: z.boolean() }).strict(),
      empty,
    ),
    /** How the window is framed: on macOS the title bar is merged with the toolbar (`inset`). */
    windowChrome: defineInvoke('app:window-chrome', empty, windowChromeSchema),
  },
  project: {
    /** The open project, if any. Used when the renderer starts, because a project may already be
     * open (reopened at launch). */
    current: defineInvoke('project:current', empty, maybeSnapshot),
    /** Shows the system dialog for a new project folder. `dialogTitle` comes from the i18n layer. */
    create: defineInvoke(
      'project:create',
      z.object({ language, dialogTitle: z.string().max(200) }).strict(),
      maybeSnapshot,
    ),
    /** Shows the system dialog to pick an existing project folder. */
    open: defineInvoke(
      'project:open',
      z.object({ dialogTitle: z.string().max(200) }).strict(),
      maybeSnapshot,
    ),
    openRecent: defineInvoke(
      'project:open-recent',
      z.object({ path: z.string().max(4000) }).strict(),
      withSnapshot,
    ),
    close: defineInvoke('project:close', empty, empty),
    recent: defineInvoke(
      'project:recent',
      empty,
      z.object({ projects: z.array(z.object({ path: z.string(), title: z.string() })) }).strict(),
    ),
    createSheet: defineInvoke(
      'project:create-sheet',
      // Without a name the sheet gets a generated file name.
      z.object({ parent: relPath, name: name.optional() }).strict(),
      withPathAndSnapshot,
    ),
    createGroup: defineInvoke(
      'project:create-group',
      z.object({ parent: relPath, name }).strict(),
      withPathAndSnapshot,
    ),
    rename: defineInvoke(
      'project:rename',
      z.object({ path: relPath, name }).strict(),
      withPathAndSnapshot,
    ),
    move: defineInvoke(
      'project:move',
      z
        .object({ path: relPath, toParent: relPath, index: z.number().int().min(0).optional() })
        .strict(),
      withPathAndSnapshot,
    ),
    /** Moves to the system trash. */
    remove: defineInvoke('project:remove', z.object({ path: relPath }).strict(), withSnapshot),
    /** `null` resets a value to its default. */
    setItem: defineInvoke(
      'project:set-item',
      z
        .object({
          path: relPath,
          status: statusSchema.nullable().optional(),
          goal: z.number().int().min(1).nullable().optional(),
          export: z.boolean().nullable().optional(),
          icon: z
            .string()
            .regex(/^[a-z0-9-]{1,32}$/)
            .nullable()
            .optional(),
          color: z
            .string()
            .regex(/^[a-z]{1,16}$/)
            .nullable()
            .optional(),
        })
        .strict(),
      withSnapshot,
    ),
    /** Renames the project (its title in project.toml), not its folder. */
    setTitle: defineInvoke(
      'project:set-title',
      z.object({ title: z.string().max(200) }).strict(),
      withSnapshot,
    ),
    /** How footnotes are numbered: continuous, or restarting at each level-1 heading. */
    setFootnoteRestart: defineInvoke(
      'project:set-footnote-restart',
      z.object({ restart: z.enum(['continuous', 'chapter']) }).strict(),
      withSnapshot,
    ),
    /** Whether block quotes get quotation marks (the marks come from the project language). */
    setQuoteBlockMarks: defineInvoke(
      'project:set-quote-block-marks',
      z.object({ blockMarks: z.boolean() }).strict(),
      withSnapshot,
    ),
    /** The kind of quotation marks (`auto`: those of the project language). */
    setQuoteStyle: defineInvoke(
      'project:set-quote-style',
      z
        .object({
          style: z.enum([
            'auto',
            'de',
            'de-guillemets',
            'ch',
            'fr',
            'en',
            'en-single',
            'sv',
            'pl',
            'ja',
          ]),
        })
        .strict(),
      withSnapshot,
    ),
    /** Spelling and grammar settings of the project. A missing field stays as it is. */
    setProofing: defineInvoke(
      'project:set-proofing',
      z
        .object({
          language: z.string().max(20).nullable().optional(),
          level: z.enum(['default', 'picky']).optional(),
          disabledRules: z.array(z.string().max(200)).max(1000).optional(),
          disabledCategories: z.array(z.string().max(100)).max(100).optional(),
        })
        .strict(),
      withSnapshot,
    ),
    removeMissing: defineInvoke(
      'project:remove-missing',
      z.object({ path: relPath }).strict(),
      withSnapshot,
    ),
    relink: defineInvoke(
      'project:relink',
      z.object({ missingPath: relPath, targetPath: relPath }).strict(),
      withSnapshot,
    ),
    readSheet: defineInvoke(
      'project:read-sheet',
      z.object({ path: relPath }).strict(),
      z.object({ content: z.string() }).strict(),
    ),
    /** Several sheets at once, in the order asked, for the continuous view. */
    readSheets: defineInvoke(
      'project:read-sheets',
      z.object({ paths: z.array(relPath).max(5000) }).strict(),
      z
        .object({ sheets: z.array(z.object({ path: z.string(), content: z.string() }).strict()) })
        .strict(),
    ),
    /** Shows the system dialog to pick an image and adds it to `assets/`. `path` is null if cancelled. */
    chooseImage: defineInvoke(
      'project:choose-image',
      z.object({ dialogTitle: z.string().max(200), filterName: z.string().max(100) }).strict(),
      z.object({ path: z.string().nullable() }).strict(),
    ),
    /** Adds an image the renderer has the bytes of (pasted or dropped) to `assets/`. */
    addImage: defineInvoke(
      'project:add-image',
      z
        .object({
          name: z.string().max(300),
          data: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 30 * 1024 * 1024),
        })
        .strict(),
      z.object({ path: z.string() }).strict(),
    ),
    /**
     * Shows the system dialog to pick a .bib file and makes it the project's bibliography. A file
     * outside the project folder is read where it is, never copied. The snapshot is null if cancelled.
     */
    chooseBibliography: defineInvoke(
      'project:choose-bibliography',
      z.object({ dialogTitle: z.string().max(200), filterName: z.string().max(100) }).strict(),
      maybeSnapshot,
    ),
    /** The works of the project's bibliography file, for citations. */
    readBibliography: defineInvoke('project:read-bibliography', empty, bibliographySchema),
    /** Draws a formula with the Typst compiler, at a fixed size; the editor scales it. */
    renderMath: defineInvoke(
      'project:render-math',
      z.object({ source: z.string().max(20_000), display: z.boolean() }).strict(),
      mathResult,
    ),
    writeSheet: defineInvoke(
      'project:write-sheet',
      z.object({ path: relPath, content: z.string().max(50_000_000) }).strict(),
      z.object({ words: z.number(), footnoteWords: z.number() }).strict(),
    ),
  },
  export: {
    /** What the export dialog shows: the templates, the styles, the profile in use, and what is open in the sheets. */
    info: defineInvoke('export:info', empty, exportInfoSchema),
    /** Asks where to save, then exports the project as a PDF with the profile. */
    run: defineInvoke('export:run', exportRequestSchema, exportResultSchema),
    /** Compiles the project with the saved profile into page images for the preview pane. A newer call supersedes one that is still running. */
    /** How the template of the saved profile numbers headings, for the cross-reference chips in the text. */
    numbering: defineInvoke('export:numbering', empty, headingNumberingSchema),
    /** `profile` previews with the profile as it is being edited, not the saved one. */
    preview: defineInvoke(
      'export:preview',
      z.object({ profile: profileSchema.optional() }).strict(),
      exportPreviewSchema,
    ),
    /** Remembers the profile (template, options, citation style) as the project's, without exporting. */
    saveProfile: defineInvoke(
      'export:save-profile',
      z.object({ profile: profileSchema }).strict(),
      empty,
    ),
    /** The first page of a template made from a sample text, as a small picture for the template list. */
    thumbnail: defineInvoke(
      'export:thumbnail',
      z.object({ template: z.string().max(60), language: language }).strict(),
      thumbnailSchema,
    ),
  },
  templates: {
    /** The bundled templates and the writer's own. */
    list: defineInvoke('templates:list', empty, z.array(templateEntrySchema)),
    /** What a template sets, and for the writer's own what they changed on top of the base. */
    get: defineInvoke(
      'templates:get',
      z.object({ id: z.string().max(60) }).strict(),
      templateDetailSchema,
    ),
    /** Makes a template of the writer's own from a copy of another, and returns its id. */
    create: defineInvoke(
      'templates:create',
      z.object({ baseId: z.string().max(60), name: z.string().max(200) }).strict(),
      z.object({ id: z.string() }).strict(),
    ),
    rename: defineInvoke(
      'templates:rename',
      z.object({ id: z.string().max(60), name: z.string().max(200) }).strict(),
      empty,
    ),
    /** Moves the template's folder to the trash. */
    remove: defineInvoke('templates:remove', z.object({ id: z.string().max(60) }).strict(), empty),
    /** Asks where to save the template (the writer's own) as one file with its fonts, and writes it. `path` is null when they cancel. */
    exportFile: defineInvoke(
      'templates:export-file',
      templateFileSchema.extend({ id: z.string().max(60), fileName: z.string().max(200) }).strict(),
      z.object({ path: z.string().nullable() }).strict(),
    ),
    /** Asks for a template file and adds it as a template of the writer's own. `id` is null when they cancel. */
    importFile: defineInvoke(
      'templates:import-file',
      templateFileSchema,
      z.object({ id: z.string().nullable() }).strict(),
    ),
    /** Asks for font files and copies them into the template (the writer's own only); returns what the template has now. */
    addFonts: defineInvoke(
      'templates:add-fonts',
      z
        .object({
          id: z.string().max(60),
          dialogTitle: z.string().max(200),
          filterName: z.string().max(100),
        })
        .strict(),
      fontsSchema,
    ),
    /** Moves a font file of the template to the trash. */
    removeFont: defineInvoke(
      'templates:remove-font',
      z.object({ id: z.string().max(60), file: z.string().max(200) }).strict(),
      fontsSchema,
    ),
    /** Changes the default of an option of a template, or whether the export dialog offers it; null takes a field back to the base's. */
    setOption: defineInvoke(
      'templates:set-option',
      z
        .object({
          id: z.string().max(60),
          option: z.string().max(60),
          default: z.union([z.string().max(500), z.boolean(), z.null()]).optional(),
          hidden: z.union([z.boolean(), z.null()]).optional(),
        })
        .strict(),
      z.object({ options: z.array(optionDetailSchema) }).strict(),
    ),
    /** Sets one value of an element, or with `null` takes it back to what the base says. */
    set: defineInvoke(
      'templates:set',
      z
        .object({
          id: z.string().max(60),
          element: z.string().max(60),
          prop: z.string().max(60),
          value: z.union([z.string().max(200), z.boolean(), z.null()]),
        })
        .strict(),
      z.object({ overrides: setsSchema }).strict(),
    ),
  },
  history: {
    /** The newest versions of the project first, and whether they are being taken. */
    list: defineInvoke(
      'history:list',
      z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
      z.object({ enabled: z.boolean(), versions: z.array(versionSchema) }).strict(),
    ),
    /** The sheets that are not the same now as in a version, or are gone: what a restore could bring back. */
    files: defineInvoke(
      'history:files',
      z.object({ id: z.string().max(80) }).strict(),
      z.object({ files: z.array(versionFileSchema), newSince: z.number() }).strict(),
    ),
    /** A file as it was in a version, and as it is now: for showing what a restore changes. Null where there is none; a file that is not text comes with its sizes only. */
    compare: defineInvoke(
      'history:compare',
      z.object({ id: z.string().max(80), path: relPath }).strict(),
      z
        .object({
          version: z.string().nullable(),
          current: z.string().nullable(),
          binary: z.boolean(),
          versionSize: z.number().nullable(),
          currentSize: z.number().nullable(),
        })
        .strict(),
    ),
    /** Saves the project as it is now as a named version. `version` is null when nothing changed since the last one. */
    save: defineInvoke(
      'history:save',
      z.object({ name: z.string().max(200) }).strict(),
      z.object({ version: versionSchema.nullable() }).strict(),
    ),
    /** Brings a sheet back as it was in a version (after saving the present state, so this can be undone). */
    restore: defineInvoke(
      'history:restore',
      z.object({ id: z.string().max(80), path: relPath }).strict(),
      withSnapshot,
    ),
    /** Brings every file back that is not the same now as in a version; with `removeNew`, files that did not exist then go to the trash. */
    restoreAll: defineInvoke(
      'history:restore-all',
      z.object({ id: z.string().max(80), removeNew: z.boolean() }).strict(),
      z.object({ snapshot: snapshotSchema, restored: z.number(), removed: z.number() }).strict(),
    ),
    /** Turns the automatic versions on or off. */
    setEnabled: defineInvoke(
      'history:set-enabled',
      z.object({ enabled: z.boolean() }).strict(),
      withSnapshot,
    ),
  },
  backup: {
    /** Where the project is backed up, and when it last was. */
    status: defineInvoke('backup:status', empty, backupStatusSchema),
    /**
     * Shows the system dialog to pick the backup folder and makes the first backup there. `chosen` is
     * false if the dialog was cancelled or the folder cannot be used (`problem` says why).
     */
    chooseFolder: defineInvoke(
      'backup:choose-folder',
      z.object({ dialogTitle: z.string().max(200) }).strict(),
      z
        .object({
          chosen: z.boolean(),
          problem: z.enum(['missing', 'inside', 'unwritable']).nullable(),
          status: backupStatusSchema,
        })
        .strict(),
    ),
    /** Stops backing up. The backups already in the folder stay. */
    disable: defineInvoke('backup:disable', empty, backupStatusSchema),
    /** Makes a backup now, even if nothing changed. */
    run: defineInvoke(
      'backup:run',
      empty,
      z.object({ result: backupResultSchema, status: backupStatusSchema }).strict(),
    ),
    /** The backups of this project in the folder, newest first. */
    list: defineInvoke(
      'backup:list',
      empty,
      z.object({ files: z.array(backupFileSchema) }).strict(),
    ),
    /** Unpacks one of this project's backups into a new folder (the system dialog asks where) and opens it. The snapshot is null if cancelled. */
    restore: defineInvoke(
      'backup:restore',
      z.object({ name: z.string().max(300), dialogTitle: z.string().max(200) }).strict(),
      restoredSchema,
    ),
    /** The same for a backup file the writer picks, with no project open: the way back on a new computer. */
    restoreFile: defineInvoke(
      'backup:restore-file',
      z
        .object({
          fileDialogTitle: z.string().max(200),
          filterName: z.string().max(100),
          folderDialogTitle: z.string().max(200),
        })
        .strict(),
      restoredSchema,
    ),
    /** Shows a backup in the system's file manager. */
    reveal: defineInvoke('backup:reveal', z.object({ name: z.string().max(300) }).strict(), empty),
  },
  thesaurus: {
    /** Synonyms for a word in its sentence, inflected like the word. */
    synonyms: defineInvoke('thesaurus:synonyms', synonymRequestSchema, synonymResultSchema),
  },
  proof: {
    /** Starts the checker if it is not running, and says how it is. */
    start: defineInvoke('proof:start', empty, z.object({ state: proofStateSchema }).strict()),
    /** Checks units of text. While the checker starts, the answer is `ok: false` with its state. */
    check: defineInvoke('proof:check', proofCheckRequestSchema, proofCheckResultSchema),
    /** The words of the personal and the project dictionary. */
    words: defineInvoke('proof:words', empty, proofWordsSchema),
    /** Adds a word to the personal dictionary or to the project's. */
    addWord: defineInvoke(
      'proof:add-word',
      z.object({ scope: z.enum(['personal', 'project']), word: z.string().max(200) }).strict(),
      proofWordsSchema,
    ),
  },
} as const satisfies InvokeTree

export const events = {
  app: {
    /** The window is closing: write unsaved text, then call `app.flushDone`. */
    flushRequested: defineEvent('app:flush-requested', empty),
    /** The application menu's "Settings …" (macOS): the renderer opens its settings window. */
    settingsRequested: defineEvent('app:settings-requested', empty),
    /** An item of the menu bar was chosen: the renderer runs the command with this id. */
    menuCommand: defineEvent('app:menu-command', menuCommandSchema),
    /** The window entered or left full screen, where the traffic lights are hidden. */
    windowChromeChanged: defineEvent('app:window-chrome-changed', windowChromeSchema),
  },
  proof: {
    /** The checker started, became ready, or stopped. */
    statusChanged: defineEvent(
      'proof:status-changed',
      z.object({ state: proofStateSchema }).strict(),
    ),
  },
  backup: {
    /** A backup started, finished, or failed. */
    changed: defineEvent('backup:changed', backupStatusSchema),
  },
  project: {
    /** The project changed on disk or in the main process. */
    changed: defineEvent('project:changed', projectChangedSchema),
  },
} as const satisfies EventTree

export type Ipc = typeof ipc
export type Events = typeof events

// ---------------------------------------------------------------------------------------------
// Types derived from the contract
// ---------------------------------------------------------------------------------------------

export type ApiOf<T> = {
  readonly [K in keyof T]: T[K] extends InvokeDef<infer Req, infer Res>
    ? (request: z.input<Req>) => Promise<Result<z.output<Res>>>
    : ApiOf<T[K]>
}

/** Subscriptions: `window.api.on.project.changed(listener)` returns an unsubscribe function. */
export type OnOf<T> = {
  readonly [K in keyof T]: T[K] extends EventDef<infer P>
    ? (listener: (payload: z.output<P>) => void) => () => void
    : OnOf<T[K]>
}

/** What the renderer sees as `window.api`. */
export type EzettaApi = ApiOf<Ipc> & { readonly version: number; readonly on: OnOf<Events> }

/** What the main process must implement. Handlers receive validated input. */
export type HandlersOf<T> = {
  readonly [K in keyof T]: T[K] extends InvokeDef<infer Req, infer Res>
    ? (request: z.output<Req>) => z.input<Res> | Promise<z.input<Res>>
    : HandlersOf<T[K]>
}
export type Handlers = HandlersOf<Ipc>

// ---------------------------------------------------------------------------------------------
// Runtime walkers
// ---------------------------------------------------------------------------------------------

/** Visit every declared call. `path` is the property path, for example ['project', 'open']. */
export function forEachInvoke(
  tree: InvokeTree,
  visit: (def: InvokeDef, path: readonly string[]) => void,
  path: readonly string[] = [],
): void {
  for (const [key, node] of Object.entries(tree)) {
    if (isInvokeDef(node)) visit(node, [...path, key])
    else forEachInvoke(node, visit, [...path, key])
  }
}

export function forEachEvent(
  tree: EventTree,
  visit: (def: EventDef, path: readonly string[]) => void,
  path: readonly string[] = [],
): void {
  for (const [key, node] of Object.entries(tree)) {
    if (isEventDef(node)) visit(node, [...path, key])
    else forEachEvent(node, visit, [...path, key])
  }
}

export type InvokeFn = (channel: string, request: unknown) => Promise<unknown>
export type SubscribeFn = (event: string, listener: (payload: unknown) => void) => () => void

function setAt(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let node = target
  for (const key of path.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>
  node[path[path.length - 1]!] = value
}

/**
 * Generate the API object from the contract. The preload passes closures over `ipcRenderer`; the
 * renderer only ever receives this narrow object, never `ipcRenderer` itself. Event payloads are
 * validated against their schema before a listener sees them.
 */
export function buildApi(invoke: InvokeFn, subscribe: SubscribeFn): EzettaApi {
  const api: Record<string, unknown> = { version: IPC_API_VERSION }
  forEachInvoke(ipc, (def, path) => {
    setAt(api, path, (request: unknown) => invoke(def.channel, request))
  })
  const on: Record<string, unknown> = {}
  forEachEvent(events, (def, path) => {
    setAt(on, path, (listener: (payload: unknown) => void) =>
      subscribe(def.event, (raw) => {
        const parsed = def.payload.safeParse(raw)
        if (parsed.success) listener(parsed.data)
      }),
    )
  })
  api['on'] = on
  return api as unknown as EzettaApi
}
