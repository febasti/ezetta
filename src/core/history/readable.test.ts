import { describe, expect, it } from 'vitest'
import { readableSheet } from './readable'
import type { ReadableOptions } from './readable'

const options: ReadableOptions = {
  citation: (group) =>
    `(${group.map((c) => c.key + (c.supplement ? `, ${c.supplement}` : '')).join('; ')})`,
  reference: (ref) => `→${ref.label}`,
  footnote: (text) => ` [Note: ${text}]`,
  call: (name, content, args) => {
    if (name === 'quote') {
      const source = args.find((a) => a.name === 'attribution')?.text
      return `„${content ?? ''}“${source ? ` — ${source}` : ''}`
    }
    if (name === 'figure') return `Figure: ${args.find((a) => a.name === 'caption')?.text ?? ''}`
    if (name === 'divider') return '* * *'
    return content ?? ''
  },
}

describe('readableSheet', () => {
  it('reads a sheet as the editor shows it, line for line', () => {
    const source = [
      '= Titel <sec-a>',
      '',
      'Text _betont_ und *wichtig* \\# mit `raw` und @kuhn1962[S. 4] @eco1977, siehe @sec-a.#footnote[Mehr bei @eco1977.]',
      '',
      '#quote(block: true, attribution: [@kant1784[S. 481]])[Aufklärung ist der Ausgang.] <q>',
      '',
      '#figure(image("a.svg", width: 60%), caption: [Werte _hier_]) <fig-a>',
      '',
      '#divider()',
    ].join('\n')
    expect(readableSheet(source, options).split('\n')).toEqual([
      'Titel',
      '',
      'Text betont und wichtig # mit raw und (kuhn1962, S. 4; eco1977), siehe →sec-a. [Note: Mehr bei (eco1977).]',
      '',
      '„Aufklärung ist der Ausgang.“ — (kant1784, S. 481)',
      '',
      'Figure: Werte hier',
      '',
      '* * *',
    ])
  })

  it('leaves text without markup as it is', () => {
    expect(readableSheet('Ein Satz.\n\nNoch einer.\n', options)).toBe('Ein Satz.\n\nNoch einer.\n')
  })
})
