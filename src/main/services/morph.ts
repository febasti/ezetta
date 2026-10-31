import { execFile, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { z } from 'zod'
import type { Inflected, MorphPort, Reading } from '@core/thesaurus/lookup'
import { executable } from './executable'
import { idleStop } from './idleStop'
import { jvmFlags } from './languageTool'
import type { Installation } from './languageTool'

/**
 * The morphology of LanguageTool: a small Java program (`tools/morph/Morph.java`) that
 * runs next to the checker, with the same language modules, and answers one JSON line with one
 * JSON line: the base form of a word in its sentence, and the forms of other words like it. It
 * starts when the first synonyms are asked for, and stops again after a few idle minutes, since it
 * holds a few hundred megabytes; the next question starts it again.
 */

export interface MorphProcess {
  send(line: string): void
  /** Called with each line the process prints. */
  onLine(listener: (line: string) => void): void
  exited: Promise<number | null>
  kill(): void
}

export interface MorphDeps {
  /** Where LanguageTool is, and the folder with the compiled helper; null if either is missing. */
  find: () => { installation: Installation; classes: string } | null
  /** Makes sure the helper is compiled (development: from the source in the checkout). */
  prepare?: () => Promise<boolean>
  launch: (found: { installation: Installation; classes: string }) => MorphProcess
  log: (message: string, cause?: unknown) => void
  /** How long a request may take; the first one loads the dictionaries. */
  timeoutMs?: number
  /** The helper is stopped after this long without a question (it holds a few hundred megabytes) and started again by the next. */
  idleStopMs?: number
}

/** How long the helper may sit unused before it gives its memory back. */
const IDLE_STOP_MS = 3 * 60 * 1000

const readingsSchema = z.object({
  ok: z.literal(true),
  readings: z.array(z.object({ lemma: z.string(), tag: z.string() })),
})
const inflectSchema = z.object({
  ok: z.literal(true),
  results: z.array(
    z.object({
      word: z.string(),
      byTag: z.record(
        z.string(),
        z.array(z.object({ form: z.string(), gender: z.string().optional() })),
      ),
    }),
  ),
})

export interface Morph extends MorphPort {
  stop(): void
}

export function createMorph(deps: MorphDeps): Morph {
  let child: MorphProcess | null = null
  let starting: Promise<MorphProcess | null> | null = null
  let broken = false
  let nextId = 1
  const waiting = new Map<number, (answer: unknown) => void>()
  /** The helper is stopped when it has not been used for a while. */
  const idle = idleStop(deps.idleStopMs ?? IDLE_STOP_MS, () => {
    if (waiting.size > 0 || starting) return false
    const unused = child
    child = null
    unused?.kill()
    return true
  })

  async function start(): Promise<MorphProcess | null> {
    if (child) return child
    if (broken) return null
    if (starting) return starting
    starting = (async () => {
      const found = deps.find()
      if (!found || (deps.prepare && !(await deps.prepare()))) {
        broken = true
        return null
      }
      try {
        const process_ = deps.launch(found)
        process_.onLine((line) => {
          try {
            const answer = JSON.parse(line) as { id?: number }
            if (typeof answer.id === 'number') waiting.get(answer.id)?.(answer)
          } catch {
            // Not an answer.
          }
        })
        void process_.exited.then(() => {
          if (child === process_) child = null
          for (const resolve of waiting.values()) resolve(null)
          waiting.clear()
        })
        child = process_
        return process_
      } catch (cause) {
        deps.log('the morphology helper could not be started', cause)
        broken = true
        return null
      }
    })().finally(() => {
      // Not inside the body: when the body finishes without waiting, this would run before `starting` is set.
      starting = null
    })
    return starting
  }

  async function ask(request: Record<string, unknown>): Promise<unknown> {
    const process_ = await start()
    if (!process_) return null
    idle.touch()
    const id = nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        resolve(null)
      }, deps.timeoutMs ?? 30_000)
      waiting.set(id, (answer) => {
        clearTimeout(timer)
        waiting.delete(id)
        resolve(answer)
        idle.touch()
      })
      process_.send(JSON.stringify({ id, ...request }))
    })
  }

  return {
    async analyze(language, text, from, to): Promise<Reading[] | null> {
      const answer = readingsSchema.safeParse(
        await ask({ op: 'analyze', language, text, from, to }),
      )
      return answer.success ? answer.data.readings : null
    },
    async inflect(language, tags, words): Promise<Inflected[] | null> {
      const answer = inflectSchema.safeParse(await ask({ op: 'inflect', language, tags, words }))
      return answer.success ? answer.data.results : null
    },
    stop() {
      idle.cancel()
      child?.kill()
      child = null
    },
  }
}

// --- the real thing --------------------------------------------------------------------------------

/** Starts the helper with the language modules and the compiled class on the classpath. */
export function launchMorph(found: { installation: Installation; classes: string }): MorphProcess {
  const { installation, classes } = found
  const classpath = [classes, installation.home, join(installation.home, 'libs', '*')].join(
    delimiter,
  )
  const child = spawn(installation.java, [...jvmFlags(384), '-cp', classpath, 'Morph'], {
    cwd: installation.home,
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: false,
    windowsHide: true,
  })
  const listeners: ((line: string) => void)[] = []
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      for (const listener of listeners) listener(line)
    }
  })
  child.stdin.on('error', () => undefined)
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code))
    child.once('error', () => resolve(null))
  })
  return {
    send: (line) => void child.stdin.write(`${line}\n`),
    onLine: (listener) => void listeners.push(listener),
    exited,
    kill: () => void child.kill(),
  }
}

/**
 * Compiles the helper if its class is missing or older than the source (development; the packaged
 * app ships the class). Needs `javac`, which sits next to `java` in a JDK.
 */
export function prepareMorph(options: {
  source: string
  out: string
  installation: Installation
}): Promise<boolean> {
  const classFile = join(options.out, 'Morph.class')
  const fresh =
    existsSync(classFile) &&
    (!existsSync(options.source) || statSync(classFile).mtimeMs >= statSync(options.source).mtimeMs)
  if (fresh) return Promise.resolve(true)
  if (!existsSync(options.source)) return Promise.resolve(existsSync(classFile))
  const javac =
    options.installation.java === 'java'
      ? 'javac'
      : join(dirname(options.installation.java), executable('javac'))
  const classpath = [options.installation.home, join(options.installation.home, 'libs', '*')].join(
    delimiter,
  )
  return new Promise((resolve) => {
    execFile(
      javac,
      ['-d', options.out, '-cp', classpath, options.source],
      { timeout: 60_000, windowsHide: true },
      (error) => resolve(error === null),
    )
  })
}
