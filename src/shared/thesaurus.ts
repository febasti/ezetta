/** Wire shapes for synonyms. They mirror `src/core/thesaurus`. */
import { z } from 'zod'

export const synonymRequestSchema = z
  .object({
    /** The language of the text as the checker names it, for example "de-DE". */
    language: z.string().max(20),
    /** The paragraph the word is in, for its grammar, and where the word is in it. */
    text: z.string().max(20_000),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  })
  .strict()

const option = z
  .object({
    text: z.string().max(200),
    note: z.string().max(100).nullable(),
    gender: z.enum(['MAS', 'FEM', 'NEU']).nullable(),
  })
  .strict()

export const synonymResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      word: z.string().max(100),
      groups: z.array(
        z
          .object({
            lemma: z.string().max(100),
            pos: z.enum(['noun', 'verb', 'adj', 'adv']),
            senses: z.array(z.object({ options: z.array(option).max(40) }).strict()).max(20),
          })
          .strict(),
      ),
    })
    .strict(),
  z.object({ ok: z.literal(false), reason: z.enum(['no_word', 'not_found']) }).strict(),
])
