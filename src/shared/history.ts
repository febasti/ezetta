/** Wire shapes for the versions of a project. They mirror `src/main/services/history.ts`. */
import { z } from 'zod'

export const versionKindSchema = z.enum(['auto', 'named', 'export', 'restore'])

export const versionSchema = z
  .object({
    id: z.string(),
    /** Milliseconds since 1970. */
    time: z.number(),
    kind: versionKindSchema,
    name: z.string().nullable(),
  })
  .strict()
export type VersionDto = z.infer<typeof versionSchema>

export const versionFileSchema = z
  .object({
    path: z.string(),
    /** The sheet's path inside `content/`, or null for another file (the manifest, an image). */
    sheet: z.string().nullable(),
    /** `modified`: not the same now as in the version. `deleted`: gone since. */
    change: z.enum(['modified', 'deleted']),
    /** A sheet's first line. */
    title: z.string(),
    /** Not text to compare (an image, a very large file): shown by its size. */
    binary: z.boolean(),
  })
  .strict()
export type VersionFileDto = z.infer<typeof versionFileSchema>
