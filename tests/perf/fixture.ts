import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { makePng } from '../e2e/helpers'

/**
 * A realistic large project for the performance checks (never real files): a thesis of
 * about 80,000 words in 8 groups of 20 sheets, with headings, citations, footnotes, formulas,
 * quotes, figures, tables and cross-references, a bibliography of 300 works and some images. It is
 * made from a fixed seed, so every run measures the same text.
 */

function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = (
  'Untersuchung Ergebnis Methode Stichprobe Analyse Theorie Ansatz Befragung Interview Daten ' +
  'Auswertung Forschung Fragestellung Hypothese Variable Zusammenhang Einfluss Entwicklung Prozess ' +
  'Struktur Funktion Bedeutung Perspektive Kontext Diskussion Literatur Konzept Modell Verfahren ' +
  'qualitativ quantitativ empirisch theoretisch methodisch systematisch kritisch zentral relevant ' +
  'deutlich zunächst außerdem jedoch daher dabei wobei sowie sodass obwohl während innerhalb ' +
  'zeigt beschreibt untersucht erklärt bezieht ergibt belegt unterscheidet berücksichtigt entspricht ' +
  'die der das den dem des ein eine einen einem einer und oder aber nicht auch noch schon sehr ' +
  'wird werden wurde wurden ist sind war waren hat haben kann können soll sollen muss müssen'
).split(' ')

export interface FixtureOptions {
  groups?: number
  sheetsPerGroup?: number
  wordsPerSheet?: number
  works?: number
  images?: number
  seed?: number
}

export interface FixtureInfo {
  root: string
  sheets: string[]
  words: number
}

export async function generateThesis(
  root: string,
  options: FixtureOptions = {},
): Promise<FixtureInfo> {
  const groups = options.groups ?? 8
  const perGroup = options.sheetsPerGroup ?? 20
  const wordsPerSheet = options.wordsPerSheet ?? 500
  const works = options.works ?? 300
  const images = options.images ?? 24
  const rnd = random(options.seed ?? 42)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!
  const id = (): string =>
    Array.from({ length: 6 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 31)]).join(
      '',
    )

  const write = async (path: string, content: string | Buffer): Promise<void> => {
    const abs = join(root, path)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }

  const keys = Array.from({ length: works }, (_, i) => `autor${i + 1}${2000 + (i % 25)}`)
  await write(
    'library.bib',
    keys
      .map(
        (key, i) =>
          `@${i % 3 === 0 ? 'book' : 'article'}{${key},\n  author = {Müller${i}, Anna and Schmidt${i}, Jonas},\n  title = {Eine Untersuchung über ${pick(WORDS)} und ${pick(WORDS)} Nr. ${i}},\n  journal = {Zeitschrift für Forschung},\n  year = {${2000 + (i % 25)}},\n  publisher = {Verlag ${i % 17}}\n}\n`,
      )
      .join('\n'),
  )
  for (let i = 0; i < images; i += 1)
    await write(`assets/bild-${i + 1}.png`, makePng(640, 400, [40 + i * 8, 120, 200 - i * 6]))

  const labels: string[] = []
  const sentence = (): string => {
    const length = 8 + Math.floor(rnd() * 12)
    const words: string[] = []
    for (let i = 0; i < length; i += 1) words.push(pick(WORDS))
    let text = words.join(' ')
    text = text[0]!.toUpperCase() + text.slice(1)
    const roll = rnd()
    if (roll < 0.1) text += ` @${pick(keys)}[S. ${1 + Math.floor(rnd() * 300)}]`
    else if (roll < 0.14) text += ` @${pick(keys)}`
    else if (roll < 0.18) text += `#footnote[Vgl. @${pick(keys)}, ${pick(WORDS)} ${pick(WORDS)}.]`
    else if (roll < 0.22) text += ` mit $x_${Math.floor(rnd() * 9)}^2 + y$`
    else if (roll < 0.25) text += ` und _${pick(WORDS)}_ sowie *${pick(WORDS)}*`
    else if (roll < 0.27 && labels.length > 0) text += ` (siehe @${pick(labels)})`
    return `${text}.`
  }
  const paragraph = (words: number): string => {
    let text = ''
    while (text.split(' ').length < words) text += `${sentence()} `
    return text.trim()
  }

  const order: Record<string, string[]> = { '': [] }
  const sheets: string[] = []
  let total = 0
  for (let g = 0; g < groups; g += 1) {
    const group = `kapitel-${String(g + 1).padStart(2, '0')}`
    order['']!.push(group)
    order[group] = []
    for (let s = 0; s < perGroup; s += 1) {
      const name = `s-${id()}.typ`
      order[group]!.push(name)
      sheets.push(`${group}/${name}`)
      let body = ''
      if (s === 0)
        body += `= Kapitel ${g + 1}: ${pick(WORDS)} und ${pick(WORDS)} <sec-k${g + 1}>\n\n`
      else if (s % 4 === 0) body += `== ${pick(WORDS)} der ${pick(WORDS)}\n\n`
      let written = 0
      while (written < wordsPerSheet) {
        const words = 60 + Math.floor(rnd() * 60)
        body += `${paragraph(words)}\n\n`
        written += words
        const extra = rnd()
        if (extra < 0.05) {
          const label = `fig-${id()}`
          labels.push(label)
          body += `#figure(\n  rect(width: 100%, height: 5cm),\n  caption: [Abbildung zu ${pick(WORDS)}],\n) <${label}>\n\n`
        } else if (extra < 0.08) {
          const label = `tbl-${id()}`
          labels.push(label)
          body += `#figure(\n  table(\n    columns: 3,\n    table.header[A][B][C],\n    [1], [2], [3],\n    [4], [5], [6],\n  ),\n  caption: [Tabelle zu ${pick(WORDS)}],\n) <${label}>\n\n`
        } else if (extra < 0.11) {
          const label = `eq-${id()}`
          labels.push(label)
          body += `$ E = m c^2 + sum_(i=1)^n a_i $ <${label}>\n\n`
        } else if (extra < 0.13) {
          body += `#quote(block: true, attribution: [@${pick(keys)}[S. ${1 + Math.floor(rnd() * 200)}]])[${paragraph(40)}]\n\n`
        } else if (extra < 0.15) {
          body += `#image("assets/bild-${1 + Math.floor(rnd() * images)}.png", width: 60%)\n\n`
        }
      }
      total += body.split(/\s+/).filter(Boolean).length
      await write(`content/${group}/${name}`, body)
    }
  }
  const orderToml = Object.entries(order)
    .map(
      ([key, list]) =>
        `${JSON.stringify(key)} = [${list.map((n) => JSON.stringify(n)).join(', ')}]`,
    )
    .join('\n')
  await write(
    'project.toml',
    `[project]\nversion = 1\ntitle = "Große Arbeit"\nlanguage = "de"\nbibliography = "library.bib"\ncitation_style = "apa-7"\n\n[goals]\nwords = 90000\n\n[order]\n${orderToml}\n`,
  )
  await write('dictionary.txt', '')
  return { root, sheets, words: total }
}

/** One sheet of many words, for the worst case of a single long text. */
export async function generateLongSheet(
  root: string,
  words: number,
  options: { dense?: boolean } = {},
): Promise<void> {
  const rnd = random(7)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!
  let text = '= Eine sehr lange Datei\n\n'
  let count = 0
  while (count < words) {
    let paragraph = ''
    while (paragraph.split(' ').length < 100) {
      const length = 8 + Math.floor(rnd() * 12)
      const sentence = Array.from({ length }, () => pick(WORDS)).join(' ')
      paragraph += `${sentence[0]!.toUpperCase()}${sentence.slice(1)}. `
    }
    if (options.dense) {
      // Every kind of widget, often: citations, footnotes, formulas, quotes, figures, cross-references.
      const n = count / 100
      paragraph = paragraph
        .split('. ')
        .map((sentence, i) =>
          i % 4 === 0
            ? `${sentence} @autor${1 + ((n + i) % 50)}2005[S. ${i + 1}]`
            : i % 4 === 1
              ? `${sentence}#footnote[Vgl. @autor${1 + ((n * 3 + i) % 50)}2010, ${pick(WORDS)}.]`
              : i % 4 === 2
                ? `${sentence} mit $x_${i % 9}^2 + y$`
                : sentence,
        )
        .join('. ')
      if (n % 5 === 0) paragraph += `\n\n$ E = m c^${n % 9} + sum_(i=1)^n a_i $ <eq-d${n}>`
      if (n % 7 === 0)
        paragraph += `\n\n#figure(\n  rect(width: 100%, height: 4cm),\n  caption: [Abbildung ${n}],\n) <fig-d${n}>`
      if (n % 9 === 0)
        paragraph += `\n\n#quote(block: true)[${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}]`
      if (n % 11 === 0) paragraph += ` Siehe @fig-d${Math.max(7, n - (n % 7))}.`
    }
    text += `${paragraph.trim()}\n\n`
    count += 100
  }
  await mkdir(join(root, 'content', 'lang'), { recursive: true })
  await writeFile(join(root, 'content', 'lang', 's-lang01.typ'), text)
  await writeFile(
    join(root, 'project.toml'),
    `[project]\nversion = 1\ntitle = "Lange Datei"\nlanguage = "de"\n\n[order]\n"" = ["lang"]\n"lang" = ["s-lang01.typ"]\n`,
  )
  await writeFile(
    join(root, 'library.bib'),
    Array.from(
      { length: 60 },
      (_, i) =>
        `@book{autor${i + 1}${2000 + 5 * Math.floor(i / 25)}, author = {Autor${i}, Anna}, title = {Titel ${i}}, year = {${2000 + 5 * Math.floor(i / 25)}}}\n`,
    ).join(''),
  )
  await writeFile(join(root, 'dictionary.txt'), '')
}
