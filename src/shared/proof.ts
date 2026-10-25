/**
 * Wire shapes for spelling and grammar. They mirror `src/core/proof`, which `shared` may
 * not import; the main process returns core values where these shapes are expected.
 */
import { z } from 'zod'

export const annotationPartSchema = z.union([
  z.object({ text: z.string().max(200_000) }).strict(),
  z
    .object({ markup: z.string().max(200_000), interpretAs: z.string().max(200).optional() })
    .strict(),
])

/** One match of the checker; what the app does not read is dropped. */
export const checkerMatchSchema = z.object({
  offset: z.number(),
  length: z.number(),
  message: z.string().max(2000),
  shortMessage: z.string().max(500).optional(),
  replacements: z.array(z.object({ value: z.string().max(500) })).max(100),
  rule: z.object({
    id: z.string().max(200),
    description: z.string().max(2000),
    issueType: z.string().max(100).optional(),
    category: z.object({ id: z.string().max(100), name: z.string().max(200) }),
  }),
})

/** `off`: not started yet. `missing`: LanguageTool or Java is not installed. */
export const proofStateSchema = z.enum(['off', 'starting', 'ready', 'missing', 'failed'])
export type ProofState = z.infer<typeof proofStateSchema>

export const proofWordsSchema = z
  .object({ personal: z.array(z.string()), project: z.array(z.string()) })
  .strict()

export const proofCheckRequestSchema = z
  .object({
    language: z.string().max(20),
    level: z.enum(['default', 'picky']),
    disabledRules: z.array(z.string().max(200)).max(1000),
    disabledCategories: z.array(z.string().max(100)).max(100),
    units: z.array(z.array(annotationPartSchema).max(20_000)).max(500),
  })
  .strict()

export const proofCheckResultSchema = z.discriminatedUnion('ok', [
  z
    .object({ ok: z.literal(true), results: z.array(z.array(checkerMatchSchema).nullable()) })
    .strict(),
  z.object({ ok: z.literal(false), state: proofStateSchema }).strict(),
])
