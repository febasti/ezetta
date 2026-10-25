/**
 * Wire shapes for projects. They mirror the types in `src/core/project`, which `shared` may not
 * import. The main process returns core values where these shapes are expected, so TypeScript
 * rejects any drift between the two.
 */
import { z } from 'zod'

export const statusSchema = z.enum(['draft', 'revised', 'final'])
export type StatusDto = z.infer<typeof statusSchema>

export interface SheetNodeDto {
  kind: 'sheet'
  path: string
  name: string
  export: boolean
  inExport: boolean
  status: StatusDto
  goal: number | null
  words: number
  footnoteWords: number
  title: string
  preview: [level: number, text: string][]
  footnotes: number
  footnotesAfterChapter: number | null
  figures: number
  tables: number
  citations: [key: string, at: number][]
  missingCitations: number[]
  citationChecks: number[]
  targets: [
    kind: 'sec' | 'fig' | 'tbl' | 'eq',
    label: string,
    level: number,
    title: string,
    at: number,
    labelAt: number,
  ][]
}
export interface MissingNodeDto {
  kind: 'missing'
  path: string
  name: string
}
export interface GroupNodeDto {
  kind: 'group'
  path: string
  name: string
  export: boolean
  icon: string | null
  color: string | null
  inExport: boolean
  children: TreeNodeDto[]
  sheetCount: number
  words: number
}
export type TreeNodeDto = SheetNodeDto | MissingNodeDto | GroupNodeDto

const sheetNode: z.ZodType<SheetNodeDto> = z.object({
  kind: z.literal('sheet'),
  path: z.string(),
  name: z.string(),
  export: z.boolean(),
  inExport: z.boolean(),
  status: statusSchema,
  goal: z.number().nullable(),
  words: z.number(),
  footnoteWords: z.number(),
  title: z.string(),
  preview: z.array(z.tuple([z.number(), z.string()])),
  footnotes: z.number(),
  footnotesAfterChapter: z.number().nullable(),
  figures: z.number(),
  tables: z.number(),
  citations: z.array(z.tuple([z.string(), z.number()])),
  missingCitations: z.array(z.number()),
  citationChecks: z.array(z.number()),
  targets: z.array(
    z.tuple([
      z.enum(['sec', 'fig', 'tbl', 'eq']),
      z.string(),
      z.number(),
      z.string(),
      z.number(),
      z.number(),
    ]),
  ),
})
const missingNode: z.ZodType<MissingNodeDto> = z.object({
  kind: z.literal('missing'),
  path: z.string(),
  name: z.string(),
})
const groupNode: z.ZodType<GroupNodeDto> = z.lazy(() =>
  z.object({
    kind: z.literal('group'),
    path: z.string(),
    name: z.string(),
    export: z.boolean(),
    icon: z.string().nullable(),
    color: z.string().nullable(),
    inExport: z.boolean(),
    children: z.array(treeNode),
    sheetCount: z.number(),
    words: z.number(),
  }),
)
const treeNode: z.ZodType<TreeNodeDto> = z.lazy(() => z.union([sheetNode, missingNode, groupNode]))

export const warningSchema = z.union([
  z.object({ kind: z.literal('missing'), path: z.string() }),
  z.object({ kind: z.literal('unlisted'), path: z.string() }),
  z.object({ kind: z.literal('manifest'), message: z.string() }),
])

export const snapshotSchema = z.object({
  revision: z.number(),
  title: z.string(),
  language: z.string(),
  citationStyle: z.string(),
  goalWords: z.number().nullable(),
  footnoteRestart: z.enum(['continuous', 'chapter']),
  bibliographyStamp: z.string(),
  bibliographyPath: z.string(),
  quoteBlockMarks: z.boolean(),
  quoteStyle: z.enum([
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
  historyEnabled: z.boolean(),
  proofing: z.object({
    language: z.string(),
    level: z.enum(['default', 'picky']),
    disabledRules: z.array(z.string()),
    disabledCategories: z.array(z.string()),
  }),
  tree: groupNode,
  warnings: z.array(warningSchema),
  totalWords: z.number(),
  totalSheets: z.number(),
})
export type SnapshotDto = z.infer<typeof snapshotSchema>

export const projectChangedSchema = z.object({
  snapshot: snapshotSchema,
  /** Sheets whose content on disk changed behind the app's back. */
  externallyChanged: z.array(z.string()),
})
export type ProjectChangedDto = z.infer<typeof projectChangedSchema>
