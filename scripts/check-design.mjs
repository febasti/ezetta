// Checks the styles of the renderer against the design foundation (docs/DESIGN.md, "Foundation"):
//
//   - every custom property a style reads is one the foundation defines (ui/foundation.css), one
//     the file sets itself, or one set at run time (listed below);
//   - no colour is written as a value (hex, rgb, hsl, oklch): colours are the foundation's roles,
//     and only ui/foundation.css spells them out;
//   - padding, margin and gap in pixels are on the spacing scale (or 1 and 2 px for hairline
//     corrections); anything else uses the scale's tokens.
//
// It reads the <style> of every Svelte file and every CSS file under src/renderer. Run by
// `npm run check`.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src/renderer'
const FOUNDATION = join(ROOT, 'ui/foundation.css')
/** Set at run time by the app's code, not in a style sheet. */
const RUNTIME = new Set(['--scrollbar-w', '--col-left', '--col-width', '--chrome-inset', '--depth'])
const SPACING = new Set(['0', '0px', '1px', '2px', '4px', '8px', '12px', '16px', '24px', '32px'])

const defines = (css) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
const foundation = defines(readFileSync(FOUNDATION, 'utf8'))

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (/\.(svelte|css)$/.test(entry.name)) yield path
  }
}

const problems = []
for (const path of files(ROOT)) {
  if (path === FOUNDATION) continue
  const source = readFileSync(path, 'utf8')
  // A Svelte file sets properties in its markup too (style:--name, or a `--name` in a style string).
  const own = new Set([
    ...defines(source),
    ...[...source.matchAll(/style:(--[\w-]+)/g)].map((m) => m[1]),
  ])
  const start = path.endsWith('.svelte') ? source.indexOf('<style') : 0
  if (start < 0) continue
  const css = source.slice(start).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const lineOf = (index) => source.slice(0, start + index).split('\n').length
  const report = (index, text) => problems.push(`${relative('.', path)}:${lineOf(index)}  ${text}`)

  for (const m of css.matchAll(/var\((--[\w-]+)/g)) {
    // A name built from a value (`var(--color-{role})`) is checked where the value comes from.
    if (css[m.index + m[0].length] === '{' || css[m.index + m[0].length] === '$') continue
    const name = m[1]
    if (!foundation.has(name) && !own.has(name) && !RUNTIME.has(name))
      report(m.index, `${name} is not a foundation token`)
  }
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/g))
    report(m.index, `a colour value (${m[0]}); use a --color- role`)
  for (const m of css.matchAll(
    /(?:^|[;{])\s*(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:\s*([^;}]+)/gm,
  )) {
    if (m[1].includes('calc(')) continue
    for (const value of m[1].match(/-?\d+(?:\.\d+)?px/g) ?? [])
      if (!SPACING.has(value.replace(/^-/, '')))
        report(m.index, `${value} is not on the spacing scale (--sp-4 … --sp-32)`)
  }
}

if (problems.length > 0) {
  console.error(`The styles leave the design foundation (docs/DESIGN.md, "Foundation"):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('Styles keep to the design foundation.')
