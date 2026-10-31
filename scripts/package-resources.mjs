// Gathers what the packaged app ships besides its own code, into `dist-resources/` (not
// in git), for electron-builder to copy into the app's Resources folder:
//
//   typst/typst     the Typst compiler (the one in EZETTA_TYPST, else on the PATH; 0.15.1, the
//                   version the golden tests pin); `typst.exe` on Windows
//   languagetool/   LanguageTool from `.dev/languagetool`, with the data of German and English only
//   java/           a Java runtime trimmed with jlink, from the JDK in EZETTA_JDK, else the one
//                   `java_home` finds on macOS (17+), else JAVA_HOME
//   morph/          the synonyms' morphology helper, compiled against that LanguageTool
//   thesaurus/      the thesaurus files from `.dev/thesaurus`
//
// At the end the trimmed LanguageTool is started with the trimmed Java and asked to check a German
// and an English sentence, and the morphology helper to find a base form, so a package that cannot
// check is never made. Run `npm run fetch:dev-data` first.
//
// For a Linux package made on a Mac, set EZETTA_TYPST to a Linux Typst binary and
// EZETTA_LINUX_JDK to an unpacked Linux JDK of the same version as the one on this machine:
// the runtime is then trimmed from that JDK's modules, and the check at the end is left out, since
// the result cannot run here.
//
// On Windows the script runs as it is (the release workflow builds the installer on a Windows
// runner): the programs are named with `.exe`, and the paths of a classpath are joined with `;`.
import { execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { basename, delimiter, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'dist-resources')
const TYPST_VERSION = '0.15.1'
const LANGUAGES = new Set(['de', 'en'])

/** Jars of LanguageTool's other languages, and of its tests: not needed for German and English. */
const UNUSED_JARS = new Set([
  'asturian-pos-dict.jar',
  'catalan-pos-dict.jar',
  'dutch-pos-dict.jar',
  'french-pos-dict.jar',
  'portuguese-pos-dict.jar',
  'spanish-pos-dict.jar',
  'morfologik-ukrainian-lt.jar',
  'morfologik-crh-lt.jar',
  'morphology-el.jar',
  'languagetool-ga-dicts.jar',
  'hanlp.jar',
  'lucene-gosen-ipadic.jar',
  'junit.jar',
  'hamcrest-core.jar',
  'languagetool-core-tests.jar',
])

/** What LanguageTool's server, the morphology helper and their libraries use of the JDK. */
const JAVA_MODULES = [
  'java.base',
  'java.compiler',
  'java.datatransfer',
  'java.desktop',
  'java.instrument',
  'java.logging',
  'java.management',
  'java.naming',
  'java.net.http',
  'java.prefs',
  'java.scripting',
  'java.security.jgss',
  'java.sql',
  'java.xml',
  'jdk.crypto.ec',
  'jdk.httpserver',
  'jdk.localedata',
  'jdk.management',
  'jdk.unsupported',
  'jdk.zipfs',
]

const linuxJdk = process.env.EZETTA_LINUX_JDK
const windows = process.platform === 'win32'
/** A program's file name here: Windows names it with `.exe`. */
const exe = (name) => (windows ? `${name}.exe` : name)
const step = (text) => console.log(`· ${text}`)
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options })

function typst() {
  const given = process.env.EZETTA_TYPST
  const binary =
    given ||
    (windows ? run('where', ['typst']).split(/\r?\n/)[0] : run('/usr/bin/which', ['typst'])).trim()
  // A Linux binary cannot be run on a Mac: the maintainer who gives one vouches for its version.
  const version = linuxJdk ? `${TYPST_VERSION}, not run` : run(binary, ['--version']).trim()
  if (!version.includes(TYPST_VERSION))
    throw new Error(`Typst ${TYPST_VERSION} is needed, ${binary} is "${version}"`)
  mkdirSync(join(out, 'typst'), { recursive: true })
  // Homebrew's is a link into its cellar: the file itself is copied.
  const target = join(out, 'typst', exe('typst'))
  copyFileSync(realpathSync(binary), target)
  chmodSync(target, 0o755)
  step(`Typst: ${version} from ${binary}`)
}

/**
 * True for a path of LanguageTool that German and English do not need. Every language stays
 * registered, since the server's language detector names them, and keeps its classes and the list
 * of its common words the detector reads; the rest of its data (dictionaries, rule files) goes.
 */
function unused(rel) {
  const parts = rel.split(sep)
  const name = basename(rel)
  if (parts.length === 1)
    return [
      'languagetool.jar',
      'languagetool-commandline.jar',
      'testrules.sh',
      'testrules.bat',
    ].includes(name)
  if (parts[0] === 'libs' && UNUSED_JARS.has(name)) return true
  if (parts[0] === 'META-INF' && parts[1] === 'maven') return true
  if (parts[0] !== 'org' || parts[1] !== 'languagetool' || parts.length < 4) return false
  const other = /^[a-z]{2,3}(-|$)/.test(parts[3]) && !LANGUAGES.has(parts[3])
  if (!other || parts.length === 4 || !(parts[2] === 'rules' || parts[2] === 'resource'))
    return false
  // A folder is kept (what is in it is decided one by one), and so are the classes.
  if (!name.includes('.') || name.endsWith('.class')) return false
  return !(parts[2] === 'resource' && parts.length === 5 && name === 'common_words.txt')
}

function languageTool() {
  const base = join(root, '.dev', 'languagetool')
  const name =
    existsSync(base) &&
    readdirSync(base).find((n) => existsSync(join(base, n, 'languagetool-server.jar')))
  if (!name)
    throw new Error('LanguageTool is not in .dev/languagetool: run `npm run fetch:dev-data`')
  const from = join(base, name)
  cpSync(from, join(out, 'languagetool'), {
    recursive: true,
    filter: (path) => !unused(relative(from, path)),
  })
  step(`LanguageTool: ${name}, with the data of German and English only`)
}

function java() {
  const home =
    process.env.EZETTA_JDK ||
    (process.platform === 'darwin'
      ? run('/usr/libexec/java_home', ['-v', '17+']).trim()
      : process.env.JAVA_HOME)
  if (!home) throw new Error('No JDK: set EZETTA_JDK or JAVA_HOME to a JDK 17 or newer')
  const jlink = join(home, 'bin', exe('jlink'))
  if (!existsSync(jlink)) throw new Error(`No jlink in ${home}: a JDK 17 or newer is needed`)
  if (linuxJdk && !existsSync(join(linuxJdk, 'jmods')))
    throw new Error(`No jmods in ${linuxJdk}: an unpacked Linux JDK is needed`)
  run(jlink, [
    ...(linuxJdk ? ['--module-path', join(linuxJdk, 'jmods')] : []),
    '--add-modules',
    JAVA_MODULES.join(','),
    '--output',
    join(out, 'java'),
    '--strip-debug',
    '--no-man-pages',
    '--no-header-files',
    '--compress=2',
  ])
  const morph = join(out, 'morph')
  mkdirSync(morph)
  const lt = join(out, 'languagetool')
  run(join(home, 'bin', exe('javac')), [
    '--release',
    '17',
    '-d',
    morph,
    '-cp',
    [lt, join(lt, 'libs', '*')].join(delimiter),
    join(root, 'tools', 'morph', 'Morph.java'),
  ])
  step(`Java: runtime from ${home}, and the morphology helper`)
}

function thesaurus() {
  const from = join(root, '.dev', 'thesaurus')
  for (const file of ['th_de_DE_v2.dat', 'th_en_US_v2.dat'])
    if (!existsSync(join(from, file)))
      throw new Error(`${file} is missing: run \`npm run fetch:dev-data\``)
  cpSync(from, join(out, 'thesaurus'), { recursive: true })
  step('Thesaurus: German and English')
}

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })

/** Starts the trimmed server with the trimmed Java and checks a sentence in each language. */
async function smokeTest() {
  const port = await freePort()
  const server = spawn(
    join(out, 'java', 'bin', exe('java')),
    [
      '-Xmx768m',
      '-cp',
      'languagetool-server.jar',
      'org.languagetool.server.HTTPServer',
      '--port',
      String(port),
    ],
    { cwd: join(out, 'languagetool'), stdio: 'ignore', windowsHide: true },
  )
  try {
    const url = `http://127.0.0.1:${port}/v2`
    for (let i = 0; ; i += 1) {
      if (i > 120) throw new Error('The trimmed LanguageTool did not start')
      const ok = await fetch(`${url}/languages`).then(
        (r) => r.ok,
        () => false,
      )
      if (ok) break
      await new Promise((r) => setTimeout(r, 500))
    }
    for (const [language, text, word] of [
      ['de-DE', 'Das ist ein Tesst.', 'Tesst'],
      ['en-US', 'This is a tset.', 'tset'],
    ]) {
      const response = await fetch(`${url}/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ language, text }),
      })
      const { matches } = await response.json()
      if (!matches.some((m) => text.slice(m.offset, m.offset + m.length) === word))
        throw new Error(`The trimmed LanguageTool did not find "${word}" (${language})`)
    }
    step('Checked: the trimmed LanguageTool finds a German and an English typo')
  } finally {
    server.kill()
  }
  // The morphology helper finds a base form with the same Java and LanguageTool.
  const answer = run(
    join(out, 'java', 'bin', exe('java')),
    ['-cp', ['morph', 'languagetool', join('languagetool', 'libs', '*')].join(delimiter), 'Morph'],
    {
      cwd: out,
      input:
        '{"id":1,"op":"analyze","language":"de-DE","text":"Die Ergebnisse sind gut.","from":4,"to":14}\n',
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  )
  if (!answer.includes('"lemma":"Ergebnis"'))
    throw new Error(`The morphology helper answered: ${answer}`)
  step('Checked: the morphology helper finds the base form of a German word')
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out)
typst()
languageTool()
java()
thesaurus()
if (linuxJdk) step('Not checked: the Linux runtime cannot run on this machine')
else await smokeTest()
/** The size of a folder in megabytes (`du` is not on every system). */
const megabytes = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0) / 1e6
console.log(`Resources are in ${relative(root, out)}/ (${Math.round(megabytes(out))} MB).`)
