/** Wire shape of a native context menu. The renderer describes it, the main process shows it. */
import { z } from 'zod'

export const MENU_ROLES = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const

const leaf = z
  .object({
    /** What `popupMenu` answers when this item is chosen. Role items need none: the system acts. */
    id: z.string().max(40).optional(),
    label: z.string().max(200).optional(),
    type: z.enum(['normal', 'separator', 'checkbox']).default('normal'),
    enabled: z.boolean().optional(),
    checked: z.boolean().optional(),
    /** The system's own cut, copy, paste, and so on, on the page. */
    role: z.enum(MENU_ROLES).optional(),
    /** Shown beside the label, in Electron's format ("CmdOrCtrl+B"). It does not bind the key. */
    accelerator: z.string().max(40).optional(),
  })
  .strict()

export const menuItemSchema = leaf.extend({ submenu: z.array(leaf).max(60).optional() }).strict()
export type MenuSpecItem = z.input<typeof menuItemSchema>

export const popupMenuRequestSchema = z
  .object({
    items: z.array(menuItemSchema).max(60),
    /** Where the menu opens, in the window's coordinates. */
    x: z.number(),
    y: z.number(),
  })
  .strict()

/** `native: false` means the app is built to use its own menus (tests): the renderer draws it. */
export const popupMenuResultSchema = z
  .object({ native: z.boolean(), id: z.string().nullable() })
  .strict()

/**
 * The application menu on macOS (the menu bar). The renderer describes it, since the commands, their
 * labels and their states live there; the main process builds it and answers a chosen item with
 * `menuCommand`. Its roles are the system's own items of the app, edit, window and view menus.
 */
export const APP_MENU_ROLES = [
  'about',
  'services',
  'hide',
  'hideOthers',
  'unhide',
  'quit',
  'cut',
  'copy',
  'paste',
  'selectAll',
  'minimize',
  'zoom',
  'front',
  'togglefullscreen',
] as const

const appLeaf = z
  .object({
    id: z.string().max(60).optional(),
    label: z.string().max(200).optional(),
    type: z.enum(['normal', 'separator', 'checkbox', 'radio']).default('normal'),
    enabled: z.boolean().optional(),
    checked: z.boolean().optional(),
    role: z.enum(APP_MENU_ROLES).optional(),
    /** Shown beside the label; the page keeps handling the key itself. */
    accelerator: z.string().max(40).optional(),
  })
  .strict()

export const appMenuItemSchema = appLeaf
  .extend({ submenu: z.array(appLeaf).max(40).optional() })
  .strict()
export type AppMenuItem = z.input<typeof appMenuItemSchema>

export const appMenuSchema = z
  .object({
    menus: z
      .array(
        z
          .object({
            label: z.string().max(60),
            /** `window` and `help` tell macOS which menu lists the windows and has the search. */
            role: z.enum(['window', 'help']).optional(),
            items: z.array(appMenuItemSchema).max(60),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()
export type AppMenu = z.input<typeof appMenuSchema>

export const menuCommandSchema = z.object({ id: z.string().max(60) }).strict()
