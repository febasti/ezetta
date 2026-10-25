/** Wire shapes for the backup of a project. They mirror `src/main/services/backup.ts`. */
import { z } from 'zod'

export const backupStatusSchema = z
  .object({
    /** A backup folder is set. */
    configured: z.boolean(),
    folder: z.string().nullable(),
    /** The folder is there and can be written to (false for a drive that is not plugged in). */
    reachable: z.boolean(),
    /** When the last backup was made, in milliseconds. */
    lastAt: z.number().nullable(),
    lastFile: z.string().nullable(),
    running: z.boolean(),
    /** The reason the last backup failed, until one succeeds. */
    error: z.string().nullable(),
  })
  .strict()
export type BackupStatusDto = z.infer<typeof backupStatusSchema>

export const backupFileSchema = z
  .object({ name: z.string(), time: z.number(), size: z.number() })
  .strict()
export type BackupFileDto = z.infer<typeof backupFileSchema>

export const backupResultSchema = z.enum(['done', 'unchanged', 'no_folder', 'unreachable'])
