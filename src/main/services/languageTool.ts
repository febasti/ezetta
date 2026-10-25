import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { z } from 'zod'
import type { AnnotationPart } from '@core/proof/extract'
import type { CheckerMatch } from '@core/proof/issues'
import { checkerMatchSchema } from '@shared/proof'
import type { ProofState } from '@shared/proof'
import { idleStop } from './idleStop'

/**
 * LanguageTool as a local server: a child process started with `spawn`, fixed
 * arguments, bound to localhost (its default), supervised with a health check and a limited
 * restart policy, and stopped on quit. Nothing is sent over the network.
 */

export interface CheckRequest {
  language: string
  level: 'default' | 'picky'
  disabledRules: readonly string[]
  disabledCategories: readonly string[]
  units: readonly (readonly AnnotationPart[])[]
}

/** One answer per unit; null for a unit the checker did not answer in time (the others stand). */
export type CheckResult =
  { ok: true; results: (CheckerMatch[] | null)[] } | { ok: false; state: ProofState }

export interface ProofService {
  state(): ProofState
  /** Starts the server if it is not running. Resolves with the state once it is known. */
  start(): Promise<ProofState>
  check(request: CheckRequest): Promise<CheckResult>
  onState(listener: (state: ProofState) => void): void
  stop(): Promise<void>
}

export interface Installation {
  java: string
  /** The folder that holds `languagetool-server.jar`. */
  home: string
}

/**
 * Where LanguageTool and Java are: the copy in the app's resources (packaging ships both), a
 * folder named for development, or `.dev/languagetool` in the checkout. Null if the server
 * is not there.
 */
export function findInstallation(options: {
  resourcesPath?: string
  appPath?: string
  home?: string
  java?: string
  exists?: (path: string) => boolean
  list?: (dir: string) => string[]
}): Installation | null {
  const exists = options.exists ?? existsSync
  const list = options.list ?? ((dir: string) => safeList(dir))
  const homes = [
    options.resourcesPath ? join(options.resourcesPath, 'languagetool') : '',
    options.home ?? '',
    ...(options.appPath
      ? list(join(options.appPath, '.dev', 'languagetool')).map((name) =>
          join(options.appPath!, '.dev', 'languagetool', name),
        )
      : []),
  ].filter(Boolean)
  const home = homes.find((dir) => exists(join(dir, 'languagetool-server.jar')))
  if (!home) return null
  const bundled = options.resourcesPath ? join(options.resourcesPath, 'java', 'bin', 'java') : ''
  const java = [bundled, options.java ?? ''].find((path) => path && exists(path)) ?? 'java'
  return { java, home }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.startsWith('LanguageTool'))
  } catch {
    return []
  }
}

export interface ServerProcess {
  /** Resolves when the process ends. */
  exited: Promise<number | null>
  kill(): void
}

export interface LanguageToolDeps {
  find: () => Installation | null
  /** Starts the server on the port; throws if Java cannot be run. */
  launch: (installation: Installation, port: number) => ServerProcess
  freePort: () => Promise<number>
  fetch: typeof fetch
  log: (message: string, cause?: unknown) => void
  /** Pause between health checks, and how many to make before giving up. */
  healthIntervalMs?: number
  healthTries?: number
  requestTimeoutMs?: number
  /**
   * The server is stopped after this long without a check, because it holds several hundred
   * megabytes (the Java process is by far the largest part of the app's memory), and started again
   * by the next check, which takes about a second. To everyone else it stays "ready".
   */
  idleStopMs?: number
}

/** How long the server may sit unused before it gives its memory back. */
const IDLE_STOP_MS = 3 * 60 * 1000
const MAX_RESTARTS = 3
const CONCURRENCY = 4
const responseSchema = z.object({ matches: z.array(checkerMatchSchema) })

export function createLanguageTool(deps: LanguageToolDeps): ProofService {
  let state: ProofState = 'off'
  let port = 0
  let process_: ServerProcess | null = null
  let starting: Promise<ProofState> | null = null
  let restarts = 0
  let stopped = false
  /** The server was stopped for being idle; the next check starts it again. */
  let asleep = false
  let inflight = 0
  const listeners = new Set<(state: ProofState) => void>()

  const setState = (next: ProofState): void => {
    if (state === next) return
    state = next
    for (const listener of listeners) listener(next)
  }

  async function healthy(): Promise<boolean> {
    try {
      const response = await deps.fetch(`http://127.0.0.1:${port}/v2/languages`, {
        signal: AbortSignal.timeout(2000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async function boot(): Promise<ProofState> {
    const installation = deps.find()
    if (!installation) return 'missing'
    setState('starting')
    try {
      port = await deps.freePort()
      const child = deps.launch(installation, port)
      process_ = child
      void child.exited.then((code) => {
        if (process_ !== child) return
        process_ = null
        if (!stopped) {
          deps.log(`LanguageTool stopped (code ${String(code)})`)
          starting = null
          // No exit code: the process could not even be started (no Java).
          setState(code === null ? 'missing' : 'failed')
        }
      })
    } catch (cause) {
      deps.log('LanguageTool could not be started', cause)
      return 'missing' // Java is not there
    }
    const tries = deps.healthTries ?? 120
    for (let i = 0; i < tries; i += 1) {
      if (process_ === null) return state === 'missing' ? 'missing' : 'failed'
      if (await healthy()) return 'ready'
      await new Promise((resolve) => setTimeout(resolve, deps.healthIntervalMs ?? 500))
    }
    process_?.kill()
    return 'failed'
  }

  /** The server is stopped when it has not been used for a while. */
  const idle = idleStop(deps.idleStopMs ?? IDLE_STOP_MS, () => {
    if (inflight > 0) return false
    if (stopped || !process_ || state !== 'ready') return true
    const child = process_
    process_ = null
    asleep = true
    child.kill()
    deps.log('LanguageTool stopped while idle')
    return true
  })

  /** Called whenever the server is used: the wait until it is stopped starts again. */
  function touch(): void {
    idle.cancel()
    if (!stopped && state === 'ready') idle.touch()
  }

  function start(): Promise<ProofState> {
    if (stopped) return Promise.resolve(state)
    if (state === 'ready' && process_ && !asleep) return Promise.resolve(state)
    if (starting) return starting
    if (state === 'failed' && restarts >= MAX_RESTARTS) return Promise.resolve(state)
    if (state === 'failed') restarts += 1
    starting = boot().then((result) => {
      starting = null
      if (result === 'ready') {
        restarts = 0
        asleep = false
      }
      setState(result)
      touch()
      return result
    })
    return starting
  }

  async function checkOne(
    annotation: readonly AnnotationPart[],
    request: CheckRequest,
  ): Promise<CheckerMatch[]> {
    const body = new URLSearchParams({
      language: request.language,
      data: JSON.stringify({ annotation }),
      level: request.level,
    })
    if (request.disabledRules.length > 0) body.set('disabledRules', request.disabledRules.join(','))
    if (request.disabledCategories.length > 0)
      body.set('disabledCategories', request.disabledCategories.join(','))
    const response = await deps.fetch(`http://127.0.0.1:${port}/v2/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(deps.requestTimeoutMs ?? 20_000),
    })
    if (!response.ok) throw new Error(`LanguageTool answered ${response.status}`)
    return responseSchema.parse(await response.json()).matches
  }

  return {
    state: () => state,
    start,
    onState: (listener) => void listeners.add(listener),
    async check(request) {
      if (state !== 'ready' || asleep) {
        const now = await start()
        if (now !== 'ready') return { ok: false, state: now }
      }
      inflight += 1
      idle.cancel()
      try {
        const results: (CheckerMatch[] | null)[] = new Array<CheckerMatch[] | null>(
          request.units.length,
        ).fill(null)
        let next = 0
        let lost: unknown = null
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, request.units.length) }, async () => {
            for (;;) {
              const at = next
              next += 1
              if (at >= request.units.length) return
              try {
                results[at] = await checkOne(request.units[at]!, request)
              } catch (cause) {
                // One unit that is too slow or that the checker cannot read must not take the
                // others with it: it stays unanswered (null) and the rest goes on.
                deps.log('LanguageTool could not check a unit', cause)
                lost = cause
              }
            }
          }),
        )
        // A server that does not answer at all is restarted at the next check.
        if (lost !== null && results.every((r) => r === null) && !(await healthy())) {
          process_?.kill()
          process_ = null
          starting = null
          setState('failed')
          return { ok: false, state }
        }
        return { ok: true, results }
      } finally {
        inflight -= 1
        touch()
      }
    },
    async stop() {
      stopped = true
      idle.cancel()
      const child = process_
      process_ = null
      child?.kill()
      setState('off')
    },
  }
}

// --- the real thing --------------------------------------------------------------------------------

/**
 * How the checker's Java is run. The heap is capped at 768 MB (a smaller one runs out of memory on
 * long units: 384 MB crashed in a test). The other flags make it give memory back instead of
 * keeping all it ever used: with the defaults the process stayed at about 990 MB after a few
 * checks, with these at about 700 MB, at the same speed (measured with `tests/perf`). Small thread
 * stacks and code cache save a little more. An option this Java does not know is ignored, so an
 * older bundled Java still starts.
 */
export const jvmFlags = (heapMb: number): string[] => [
  '-XX:+IgnoreUnrecognizedVMOptions',
  `-Xmx${heapMb}m`,
  '-Xss512k',
  '-XX:ReservedCodeCacheSize=64m',
  '-XX:MinHeapFreeRatio=10',
  '-XX:MaxHeapFreeRatio=25',
  '-XX:G1PeriodicGCInterval=10000',
]

/** Starts `java -cp languagetool-server.jar org.languagetool.server.HTTPServer`. */
export function launchServer(installation: Installation, port: number): ServerProcess {
  const child: ChildProcess = spawn(
    installation.java,
    [
      ...jvmFlags(768),
      '-cp',
      'languagetool-server.jar',
      'org.languagetool.server.HTTPServer',
      '--port',
      String(port),
    ],
    { cwd: installation.home, stdio: 'ignore', shell: false },
  )
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code))
    child.once('error', () => resolve(null))
  })
  return { exited, kill: () => void child.kill() }
}

/**
 * A server that already runs on this machine, at a port of 127.0.0.1: development and tests share
 * one between many starts of the app instead of waiting for Java each time. The app does not start
 * or stop it; "stopping" it when idle only forgets it until the next check.
 */
export function attachedServer(
  port: number,
): Pick<LanguageToolDeps, 'find' | 'launch' | 'freePort'> {
  return {
    find: () => ({ java: '', home: '' }),
    launch: () => ({ exited: new Promise<never>(() => undefined), kill: () => undefined }),
    freePort: () => Promise.resolve(port),
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
