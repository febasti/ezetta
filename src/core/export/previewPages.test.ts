import { describe, expect, it } from 'vitest'
import { parseOutline, svgPageSize } from './previewPages'

describe('svgPageSize', () => {
  it('reads the size in points from the view box', () => {
    const head =
      '<svg viewBox="0 0 595.275590551 841.88976378" width="595.275590551pt" height="841.88976378pt" xmlns="http://www.w3.org/2000/svg">'
    expect(svgPageSize(head)).toEqual({ width: 595.275590551, height: 841.88976378 })
  })

  it('is nothing for a file that is not a page', () => {
    expect(svgPageSize('<svg width="10pt">')).toBeNull()
    expect(svgPageSize('<svg viewBox="0 0 0 10">')).toBeNull()
    expect(svgPageSize('PNG')).toBeNull()
  })
})

describe('parseOutline', () => {
  it('keeps the headings with their number, text and place', () => {
    const json = JSON.stringify([
      { level: 1, number: '1', text: 'Ein  Kapitel ', page: 2, y: 70.8 },
      { level: 2, number: null, text: 'Zweiter\n Teil', page: 3, y: 200 },
    ])
    expect(parseOutline(json, 4)).toEqual([
      { level: 1, number: '1', text: 'Ein Kapitel', page: 2, y: 70.8 },
      { level: 2, number: null, text: 'Zweiter Teil', page: 3, y: 200 },
    ])
  })

  it('drops what does not fit the pages or is not an entry', () => {
    const json = JSON.stringify([
      { level: 1, number: '1', text: 'Zu weit', page: 9, y: 0 },
      { level: 0, number: '1', text: 'Keine Ebene', page: 1, y: 0 },
      { level: 1, number: 2, text: 'Zahl als Zahl', page: 1, y: -3 },
      'Text',
      null,
    ])
    expect(parseOutline(json, 2)).toEqual([
      { level: 1, number: null, text: 'Zahl als Zahl', page: 1, y: 0 },
    ])
  })

  it('is empty for output that is not a list', () => {
    expect(parseOutline('error: something', 3)).toEqual([])
    expect(parseOutline('{"a":1}', 3)).toEqual([])
  })
})
