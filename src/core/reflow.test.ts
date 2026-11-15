import { describe, expect, it } from 'vitest'
import { reflow } from './reflow'

const texts = (source: string): string[] => reflow(source).map((line) => line.text)

describe('reflow', () => {
  it('joins the lines a wrap broke, and keeps the end of a paragraph', () => {
    const source = [
      'Ezetta is free software, released under the GNU General Public License, version 3 or (at',
      'your option) any later version. The license text is in the file LICENSE.',
      'Source code: https://example.org/ezetta',
    ].join('\n')
    expect(texts(source)).toEqual([
      'Ezetta is free software, released under the GNU General Public License, version 3 or (at your option) any later version. The license text is in the file LICENSE.',
      'Source code: https://example.org/ezetta',
    ])
  })

  it('keeps headings, rulers, blank lines and list items on lines of their own', () => {
    const source = [
      '=====================',
      '1. Programs',
      '=====================',
      '',
      'PREAMBLE',
      'The goals of the Open Font License (OFL) are to stimulate worldwide',
      'development of collaborative font projects, to support the font creation',
      'efforts of academic communities.',
      '- one item of a list that is long enough to be wrapped somewhere in it',
      '- another',
    ].join('\n')
    expect(texts(source)).toEqual([
      '=====================',
      '1. Programs',
      '=====================',
      '',
      'PREAMBLE',
      'The goals of the Open Font License (OFL) are to stimulate worldwide development of collaborative font projects, to support the font creation efforts of academic communities.',
      '- one item of a list that is long enough to be wrapped somewhere in it',
      '- another',
    ])
  })

  it('marks the rulers', () => {
    expect(reflow('Title\n=========\n').map((line) => line.ruler)).toEqual([false, true, false])
  })

  it('keeps the indent of a block and joins only within it', () => {
    const source = [
      'Typst 0.15.1 (the typesetting compiler)',
      '  Apache License 2.0, reproduced in full at the end of this file, with the notes of its',
      '  authors.',
      'LanguageTool',
    ].join('\n')
    expect(reflow(source)).toEqual([
      { indent: 0, text: 'Typst 0.15.1 (the typesetting compiler)', ruler: false },
      {
        indent: 2,
        text: 'Apache License 2.0, reproduced in full at the end of this file, with the notes of its authors.',
        ruler: false,
      },
      { indent: 0, text: 'LanguageTool', ruler: false },
    ])
  })
})
