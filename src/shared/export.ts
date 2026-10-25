/** Wire shapes for the export. They mirror `src/core/export`. */
import { z } from 'zod'

const localText = z.object({ de: z.string(), en: z.string() }).strict()

export const profileSchema = z
  .object({
    name: z.string().max(100),
    template: z.string().max(60),
    citationStyle: z.string().max(60),
    marks: z.enum(['hide', 'show']),
    comments: z.enum(['remove', 'footnote']),
    options: z.record(z.string().max(60), z.union([z.string().max(500), z.boolean()])),
  })
  .strict()

const optionBase = { id: z.string(), label: localText, hidden: z.boolean().optional() }
const optionValues = z.array(z.object({ id: z.string(), label: localText }).strict())
export const optionSchema = z.discriminatedUnion('type', [
  z.object({ ...optionBase, type: z.literal('text'), default: z.string() }).strict(),
  z.object({ ...optionBase, type: z.literal('bool'), default: z.boolean() }).strict(),
  z
    .object({
      ...optionBase,
      type: z.literal('enum'),
      default: z.string(),
      values: optionValues,
    })
    .strict(),
])
const option = optionSchema

export const templateSchema = z
  .object({
    id: z.string(),
    name: localText,
    description: localText,
    options: z.array(option),
    /** A bundled template cannot be changed; the writer's own can. */
    builtin: z.boolean(),
  })
  .strict()

/** A problem the compiler reports, or the app found before it ran. `sheet` is null for the template. */
export const diagnosticSchema = z
  .object({
    severity: z.enum(['error', 'warning']),
    sheet: z.string().nullable(),
    line: z.number(),
    message: z.string().max(2000),
  })
  .strict()

export const warningsSchema = z
  .object({
    highlights: z.number(),
    comments: z.number(),
    missingCitations: z.number(),
    checks: z.number(),
    /** References to headings that no sheet in the export has. */
    references: z.array(
      z.object({ sheet: z.string(), line: z.number(), label: z.string() }).strict(),
    ),
    /** Citations of works the bibliography does not have. */
    unknownCitations: z.array(
      z.object({ sheet: z.string(), line: z.number(), key: z.string() }).strict(),
    ),
    /** Figures whose image is not chosen yet (they print as an empty frame). */
    emptyImages: z.array(z.object({ sheet: z.string(), line: z.number() }).strict()),
  })
  .strict()

export const exportInfoSchema = z
  .object({
    templates: z.array(templateSchema),
    styles: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
    profile: profileSchema,
    warnings: warningsSchema,
    /** Whether the Typst compiler was found. */
    compiler: z.boolean(),
  })
  .strict()

/** A small picture of the first page of a template, made from a sample text. `png` is base64; null when the compiler is missing or failed. */
export const thumbnailSchema = z.object({ png: z.string().max(3_000_000).nullable() }).strict()

export const exportRequestSchema = z
  .object({
    profile: profileSchema,
    dialogTitle: z.string().max(200),
    filterName: z.string().max(100),
    /** The file name the save dialog proposes. */
    fileName: z.string().max(200),
  })
  .strict()

/**
 * The preview: the pages of the project made as images in the project's `_build/preview`
 * folder, served like the project's other images. `stamp` changes with every refresh, so a page is
 * not taken from the cache. `superseded`: a newer refresh was asked for while this one ran.
 */
export const exportPreviewSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      pages: z.number(),
      stamp: z.string(),
      diagnostics: z.array(diagnosticSchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['no_compiler', 'failed', 'superseded']),
      diagnostics: z.array(diagnosticSchema),
    })
    .strict(),
])

export const exportResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      path: z.string(),
      pages: z.number().nullable(),
      diagnostics: z.array(diagnosticSchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['cancelled', 'no_compiler', 'failed']),
      diagnostics: z.array(diagnosticSchema),
    })
    .strict(),
])

/** How the template of the saved profile numbers headings. */
export const headingNumberingSchema = z
  .object({
    formats: z
      .array(z.enum(['arabic', 'roman', 'roman_lower', 'alpha', 'alpha_lower']))
      .min(1)
      .max(8),
    depth: z.number().int().min(0).max(6),
    separator: z.enum(['point', 'dash', 'space']),
    /** The words the template uses for what a reference points at, where it does not use the language's own. */
    supplements: z
      .object({
        sec: z.string().max(60).optional(),
        fig: z.string().max(60).optional(),
        tbl: z.string().max(60).optional(),
        eq: z.string().max(60).optional(),
      })
      .strict(),
    /** What stands between the label of a caption and its text. */
    captionSeparator: z.enum(['colon', 'period', 'dash', 'space']),
  })
  .strict()
