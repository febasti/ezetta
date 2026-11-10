import { describe, expect, it } from 'vitest'
import { ELEMENTS } from '@core/export/elements'
import { panelLines } from './panelLines'
import { panelLayout } from './schematics'

describe('the lines of the template editor', () => {
  it('put the size with the line spacing, and the weight with italic', () => {
    expect(panelLines(['font', 'size', 'weight', 'italic', 'color', 'line_height'])).toEqual([
      { props: ['font'] },
      expect.objectContaining({ props: ['size', 'line_height'] }),
      expect.objectContaining({ props: ['weight', 'italic'] }),
      { props: ['color'] },
    ])
  })

  it('leave a value alone when what it shares a line with is not there', () => {
    expect(panelLines(['size', 'color'])).toEqual([{ props: ['size'] }, { props: ['color'] }])
  })

  it('show every value of every group exactly once', () => {
    for (const element of ELEMENTS)
      for (const group of panelLayout(element).groups)
        expect(
          panelLines(group.ids)
            .flatMap((l) => l.props)
            .sort(),
          `${element.id} ${group.id}`,
        ).toEqual([...group.ids].sort())
  })
})
