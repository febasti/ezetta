import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mathDocument, parseMathSvg, previewProblem } from '@core/typst/math'
import { mathDiagnostic } from '@core/typst/mathError'
import { executable } from './executable'

/** Drawing formulas with the Typst compiler (a child process, `spawn`, fixed arguments). */

export type MathResult =
  | { ok: true; svg: string; width: number; height: number; baseline: number | null }
  | {
      ok: false
      reason: 'invalid' | 'code' | 'too_long' | 'unavailable' | 'busy'
      message: string
      /** For a formula that does not compile: where in its source, when the compiler says. */
      at?: number | null
    }

export interface MathRenderer {
  render(source: string, display: boolean): Promise<MathResult>
}

export interface TypstRun {
  code: number | null
  stdout: string
  stderr: string
}

/** Runs the compiler with the page on stdin. Throws when it cannot be started. */
export type TypstRunner = (input: string) => Promise<TypstRun>

const ARGS = [
  'compile',
  // The same fonts on every machine (Typst's own, with New Computer Modern Math), so the
  // preview does not depend on what is installed.
  '--ignore-system-fonts',
  '--diagnostic-format',
  'short',
  '--format',
  'svg',
  '-',
  '-',
]
const TIMEOUT_MS = 8000
const MAX_OUTPUT = 4_000_000
const MAX_WAITING = 40

/**
 * Where the compiler is: the packaged copy, a path named for development and tests, or a common
 * install location.
 */
export function findTypst(options: {
  resourcesPath?: string
  override?: string
  exists?: (path: string) => boolean
  platform?: NodeJS.Platform
}): string {
  const exists = options.exists ?? existsSync
  const candidates = [
    options.resourcesPath
      ? join(options.resourcesPath, 'typst', executable('typst', options.platform))
      : '',
    options.override ?? '',
    '/opt/homebrew/bin/typst',
    '/usr/local/bin/typst',
    '/usr/bin/typst',
  ].filter(Boolean)
  return candidates.find((path) => exists(path)) ?? 'typst'
}

/** The real runner: no shell, an empty working directory, a time limit, and a cap on the output. */
export function spawnTypst(binary: string): TypstRunner {
  return (input) =>
    new Promise((resolve, reject) => {
      const child = spawn(binary, ARGS, {
        cwd: tmpdir(),
        shell: false,
        stdio: 'pipe',
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (action: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        action()
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => resolve({ code: null, stdout: '', stderr: 'error: timed out' }))
      }, TIMEOUT_MS)
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.length > MAX_OUTPUT) {
          child.kill('SIGKILL')
          finish(() => resolve({ code: null, stdout: '', stderr: 'error: output too large' }))
        }
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        if (stderr.length < 20_000) stderr += chunk
      })
      child.on('error', (cause) => finish(() => reject(cause)))
      child.on('close', (code) => finish(() => resolve({ code, stdout, stderr })))
      child.stdin.on('error', () => undefined) // a compiler that exits early closes the pipe
      child.stdin.end(input)
    })
}

/** The first error of the compiler's short report, without the position. */
export function firstError(stderr: string): string {
  const line = stderr.split('\n').find((l) => /\berror:/.test(l)) ?? stderr.split('\n')[0] ?? ''
  return line.replace(/^.*?\berror:\s*/, '').trim() || 'Could not draw the formula'
}

export function createMathRenderer(
  run: TypstRunner,
  options: { concurrency?: number } = {},
): MathRenderer {
  // One run takes about 12 ms; four at a time draw the 40 formulas of a sheet in about 0.15 s
  // (two: 0.28 s) and still leave cores for the editor.
  const limit = options.concurrency ?? 4
  let active = 0
  const waiting: (() => void)[] = []

  const slot = async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    active += 1
    try {
      return await job()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }

  return {
    async render(source, display) {
      const problem = previewProblem(source)
      if (problem)
        return {
          ok: false,
          reason: problem,
          message:
            problem === 'code' ? 'Code in a formula is not previewed' : 'The formula is too long',
        }
      if (waiting.length >= MAX_WAITING) return { ok: false, reason: 'busy', message: 'Busy' }
      let result: TypstRun
      try {
        result = await slot(() => run(mathDocument(source, display)))
      } catch {
        return { ok: false, reason: 'unavailable', message: 'The Typst compiler was not found' }
      }
      if (result.code !== 0) {
        const found = mathDiagnostic(result.stderr, source, display)
        return {
          ok: false,
          reason: 'invalid',
          message: found.message || firstError(result.stderr),
          at: found.at,
        }
      }
      const drawn = parseMathSvg(result.stdout, display)
      if (!drawn) return { ok: false, reason: 'invalid', message: 'Unexpected output' }
      return { ok: true, ...drawn }
    },
  }
}
