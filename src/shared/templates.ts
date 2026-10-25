/** Wire shapes for the writer's own templates and their editor. They mirror `src/core/export/custom.ts`. */
import { z } from 'zod'
import { optionSchema } from './export'

const localText = z.object({ de: z.string(), en: z.string() }).strict()

/** What a style sets: element id, then property id, then the value. */
export const setsSchema = z.record(
  z.string().max(60),
  z.record(z.string().max(60), z.union([z.string().max(200), z.boolean()])),
)

export const templateEntrySchema = z
  .object({
    id: z.string(),
    name: localText,
    builtin: z.boolean(),
    /** The bundled template a custom one is made from. */
    base: z.string().nullable(),
  })
  .strict()

const value = z.union([z.string().max(500), z.boolean()])

/** An option as the editor shows it: the option, what the base's default is, and whether the dialog offers it. */
export const optionDetailSchema = z.intersection(
  optionSchema,
  z.object({ baseDefault: value, hidden: z.boolean() }),
)

export const templateDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    builtin: z.boolean(),
    base: z.string().nullable(),
    baseSets: setsSchema,
    overrides: setsSchema,
    /** The font files the writer added to this template. */
    fonts: z.array(z.string()),
    /** The families a property can name here: those Typst brings and those of the added files. */
    families: z.array(z.string()),
    /** The options of the template, with what the base has and what the writer changed. */
    options: z.array(optionDetailSchema),
  })
  .strict()

export const fontsSchema = z
  .object({ fonts: z.array(z.string()), families: z.array(z.string()) })
  .strict()

export const templateFileSchema = z
  .object({ dialogTitle: z.string().max(200), filterName: z.string().max(100) })
  .strict()
