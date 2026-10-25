/**
 * The sample sheet a template's thumbnail is made from: a chapter, a section with a
 * footnote, and a list, so the look of headings, text and notes can be told apart at a glance. The
 * words are placeholder text, as a type specimen has, so no template is judged by what it says.
 */

export type SampleLanguage = 'de' | 'en'

const WORDS: Record<SampleLanguage, { chapter: string; section: string; items: string[] }> = {
  de: { chapter: 'Kapitel', section: 'Abschnitt', items: ['Erster Punkt', 'Zweiter Punkt'] },
  en: { chapter: 'Chapter', section: 'Section', items: ['First point', 'Second point'] },
}

export const sampleTitle = (language: SampleLanguage): string =>
  language === 'de' ? 'Titel der Arbeit' : 'Title of the work'

export function sampleSheet(language: SampleLanguage): string {
  const words = WORDS[language]
  return [
    `= ${words.chapter}`,
    '',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    '',
    `== ${words.section}`,
    '',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.#footnote[Excepteur sint occaecat cupidatat non proident.] Sunt in culpa qui officia deserunt mollit anim id est laborum.',
    '',
    ...words.items.map((item) => `- ${item}`),
    '',
  ].join('\n')
}
