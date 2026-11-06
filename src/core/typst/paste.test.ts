import { describe, expect, it } from 'vitest'
import { escapeMarkup, htmlParagraphs, pastedText, plainParagraphs } from './paste'

describe('plain text from the clipboard', () => {
  it('keeps empty lines as the breaks between paragraphs and makes every other line break a space', () => {
    expect(
      plainParagraphs('Eine Zeile, die im PDF\numbricht, und weiter.\n\nZweiter Absatz.'),
    ).toEqual(['Eine Zeile, die im PDF umbricht, und weiter.', 'Zweiter Absatz.'])
    expect(plainParagraphs('Eins\r\nzwei\r\n  \r\n\r\nDrei')).toEqual(['Eins zwei', 'Drei'])
  })

  it('does not guess: a hyphen at the end of a line stays', () => {
    expect(plainParagraphs('Ost-\nWest')).toEqual(['Ost- West'])
  })
})

describe('HTML from the clipboard', () => {
  it('takes a paragraph from each block element', () => {
    expect(
      htmlParagraphs(
        '<p>Eins\nund mehr</p><p>Zwei<br>Zeile</p><h2>Titel</h2><ul><li>A</li><li>B</li></ul>',
      ),
    ).toEqual(['Eins und mehr', 'Zwei Zeile', 'Titel', 'A', 'B'])
  })

  it('leaves out what is not text, drops empty blocks, and reads entities', () => {
    const word =
      '<html><head><style>p { margin: 0 }</style></head><body><!--StartFragment-->' +
      '<p class=MsoNormal>Erster <b>Absatz</b> &amp; mehr<o:p></o:p></p><p>&nbsp;</p>' +
      '<![if !supportLists]><p>&bdquo;Zweiter&ldquo; &#8211; &#x2026;</p><!--EndFragment--></body></html>'
    expect(htmlParagraphs(word)).toEqual(['Erster Absatz & mehr', '„Zweiter“ – …'])
  })
})

describe('markup in pasted text', () => {
  it('is escaped, so it prints as it was copied', () => {
    expect(escapeMarkup('a@b.de, #1, *x*, _y_, $5, <tag>, `c`, ~, [1], a\\b', false)).toBe(
      'a\\@b.de, \\#1, \\*x\\*, \\_y\\_, \\$5, \\<tag>, \\`c\\`, \\~, \\[1\\], a\\\\b',
    )
    expect(escapeMarkup('a // b /* c */ d::e', false)).toBe('a \\// b /\\* c \\*/ d:\\:e')
  })

  it('leaves an address alone', () => {
    expect(escapeMarkup('Siehe https://example.org/a_b#c und *das*.', false)).toBe(
      'Siehe https://example.org/a_b#c und \\*das\\*.',
    )
  })

  it('escapes what would start a heading or a list at the start of a line, and only there', () => {
    expect(escapeMarkup('= Titel', true)).toBe('\\= Titel')
    expect(escapeMarkup('== Titel', true)).toBe('\\== Titel')
    expect(escapeMarkup('- eins', true)).toBe('\\- eins')
    expect(escapeMarkup('+ eins', true)).toBe('\\+ eins')
    expect(escapeMarkup('12. Mai', true)).toBe('12\\. Mai')
    expect(escapeMarkup('/ Begriff: x', true)).toBe('\\/ Begriff: x')
    expect(escapeMarkup('- eins', false)).toBe('- eins')
    expect(escapeMarkup('-5 Grad', true)).toBe('-5 Grad')
  })
})

describe('a paste', () => {
  it('writes the paragraphs behind empty lines, from the HTML where it has several', () => {
    expect(pastedText('Eins\nZwei', '<p>Eins</p><p>Zwei</p>', false)).toBe('Eins\n\nZwei')
    expect(pastedText('Eins\nZwei', null, false)).toBe('Eins Zwei')
    // The same as the plain text: the editor pastes it itself.
    expect(pastedText('Eins\n\nZwei', '<span></span>', false)).toBeNull()
  })

  it('escapes each paragraph, the ones after the first at the start of their line', () => {
    expect(pastedText('- eins\n\n- zwei @x', null, false)).toBe('- eins\n\n\\- zwei \\@x')
    expect(pastedText('- eins\n\n- zwei', null, true)).toBe('\\- eins\n\n\\- zwei')
  })

  it('keeps the spaces of text on one line, and is left to the editor when nothing changes', () => {
    expect(pastedText(' a@b ', null, false)).toBe(' a\\@b ')
    expect(pastedText('ein Wort', null, false)).toBeNull()
    expect(pastedText('ein Wort', '<span>ein <b>Wort</b></span>', false)).toBeNull()
    expect(pastedText('', null, false)).toBeNull()
  })
})
