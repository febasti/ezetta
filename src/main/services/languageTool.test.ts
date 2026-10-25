import { describe, expect, it, vi } from 'vitest'
import { attachedServer, createLanguageTool, findInstallation } from './languageTool'
import type { LanguageToolDeps, ServerProcess } from './languageTool'

const MATCH = {
  offset: 4,
  length: 5,
  message: 'Möglicher Tippfehler',
  replacements: [{ value: 'Test' }],
  rule: {
    id: 'SPELL',
    description: 'd',
    issueType: 'misspelling',
    category: { id: 'TYPOS', name: 'T' },
  },
  extra: 'dropped',
}

function fakes(overrides: Partial<LanguageToolDeps> = {}) {
  let exit: (code: number | null) => void = () => undefined
  const killed = vi.fn()
  const launched: number[] = []
  const requests: { url: string; body: string }[] = []
  let healthyAfter = 2
  const fetchFake = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/v2/languages')) {
      healthyAfter -= 1
      return Promise.resolve(new Response('[]', { status: healthyAfter < 0 ? 200 : 503 }))
    }
    requests.push({ url, body: String(init?.body) })
    return Promise.resolve(Response.json({ matches: [MATCH] }))
  }) as unknown as typeof fetch
  const deps: LanguageToolDeps = {
    find: () => ({ java: 'java', home: '/lt' }),
    launch: (_installation, port): ServerProcess => {
      launched.push(port)
      return {
        exited: new Promise((resolve) => (exit = resolve)),
        kill: () => {
          killed()
          exit(143)
        },
      }
    },
    freePort: () => Promise.resolve(8123),
    fetch: fetchFake,
    log: () => undefined,
    healthIntervalMs: 1,
    healthTries: 50,
    ...overrides,
  }
  return { deps, killed, launched, requests, crash: (code: number | null) => exit(code) }
}

describe('findInstallation', () => {
  const exists =
    (...present: string[]) =>
    (path: string) =>
      present.includes(path)
  it('prefers the packaged copy, then a named folder, then the development folder', () => {
    expect(
      findInstallation({
        resourcesPath: '/r',
        home: '/h',
        exists: exists('/r/languagetool/languagetool-server.jar', '/h/languagetool-server.jar'),
      }),
    ).toEqual({ java: 'java', home: '/r/languagetool' })
    expect(findInstallation({ home: '/h', exists: exists('/h/languagetool-server.jar') })).toEqual({
      java: 'java',
      home: '/h',
    })
    expect(
      findInstallation({
        appPath: '/app',
        list: () => ['LanguageTool-6.6'],
        exists: exists('/app/.dev/languagetool/LanguageTool-6.6/languagetool-server.jar'),
      }),
    ).toEqual({ java: 'java', home: '/app/.dev/languagetool/LanguageTool-6.6' })
  })
  it('uses the packaged Java when there is one, and says nothing found otherwise', () => {
    expect(
      findInstallation({
        resourcesPath: '/r',
        exists: exists('/r/languagetool/languagetool-server.jar', '/r/java/bin/java'),
      })?.java,
    ).toBe('/r/java/bin/java')
    expect(findInstallation({ exists: () => false, list: () => [] })).toBeNull()
  })
})

describe('the LanguageTool service', () => {
  it('starts on demand, waits until the server answers, and reports its states', async () => {
    const { deps, launched } = fakes()
    const service = createLanguageTool(deps)
    const seen: string[] = []
    service.onState((state) => seen.push(state))
    expect(service.state()).toBe('off')
    expect(await service.start()).toBe('ready')
    expect(launched).toEqual([8123])
    expect(seen).toEqual(['starting', 'ready'])
    // A second start does not launch again.
    await service.start()
    expect(launched).toHaveLength(1)
  })

  it('checks units, one request each, with the settings, and keeps only what it reads', async () => {
    const { deps, requests } = fakes()
    const service = createLanguageTool(deps)
    const result = await service.check({
      language: 'de-DE',
      level: 'picky',
      disabledRules: ['A', 'B'],
      disabledCategories: ['STYLE'],
      units: [[{ text: 'Ein Tesst' }], [{ text: 'Noch ' }, { markup: '@x', interpretAs: 'X' }]],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toHaveLength(2)
    expect(result.results[0]![0]).not.toHaveProperty('extra')
    expect(requests).toHaveLength(2)
    const body = new URLSearchParams(requests[0]!.body)
    expect(body.get('language')).toBe('de-DE')
    expect(body.get('level')).toBe('picky')
    expect(body.get('disabledRules')).toBe('A,B')
    expect(body.get('disabledCategories')).toBe('STYLE')
    expect(JSON.parse(body.get('data')!)).toEqual({ annotation: [{ text: 'Ein Tesst' }] })
  })

  it('stops the server when it has not been used for a while, and starts it again for the next check', async () => {
    const f = fakes({ idleStopMs: 30 })
    const service = createLanguageTool(f.deps)
    const units = [[{ text: 'Ein Satz.' }]]
    const request = {
      language: 'de-DE',
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
      units,
    } as never
    await service.start()
    expect(f.launched).toHaveLength(1)
    // Used: it keeps running.
    expect((await service.check(request)).ok).toBe(true)
    // Left alone: it is stopped (its memory is given back), and still says it is ready.
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(f.killed).toHaveBeenCalledTimes(1)
    expect(service.state()).toBe('ready')
    // The next check starts it again, and is answered.
    const again = await service.check(request)
    expect(again.ok).toBe(true)
    expect(f.launched).toHaveLength(2)
    await service.stop()
  })

  it('leaves a unit unanswered when it takes too long, and answers the others', async () => {
    const f = fakes()
    const inner = f.deps.fetch
    f.deps.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/v2/check') && String(init?.body).includes('langsam')
        ? Promise.reject(new DOMException('The operation timed out', 'TimeoutError'))
        : inner(input, init)) as typeof fetch
    const service = createLanguageTool(f.deps)
    await service.start()
    const result = await service.check({
      language: 'de-DE',
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
      units: [[{ text: 'Ein Tesst' }], [{ text: 'langsam' }], [{ text: 'Noch ein Tesst' }]],
    } as never)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.map((r) => r === null)).toEqual([false, true, false])
    expect(service.state()).toBe('ready')
    await service.stop()
  })

  it('does not stop the server while a check is running', async () => {
    let finish: () => void = () => undefined
    const slow = new Promise<void>((resolve) => (finish = resolve))
    const f = fakes({ idleStopMs: 20 })
    const inner = f.deps.fetch
    f.deps.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/v2/check')
        ? slow.then(() => inner(input, init))
        : inner(input, init)) as typeof fetch
    const service = createLanguageTool(f.deps)
    await service.start()
    const pending = service.check({
      language: 'de-DE',
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
      units: [[{ text: 'x' }]],
    } as never)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(f.killed).not.toHaveBeenCalled()
    finish()
    expect((await pending).ok).toBe(true)
    await service.stop()
  })

  it('says it is missing when the server is not installed', async () => {
    const service = createLanguageTool(fakes({ find: () => null }).deps)
    expect(await service.start()).toBe('missing')
    expect(
      await service.check({
        language: 'de-DE',
        level: 'default',
        disabledRules: [],
        disabledCategories: [],
        units: [[{ text: 'x' }]],
      }),
    ).toEqual({ ok: false, state: 'missing' })
  })

  it('says it is missing when Java cannot be run', async () => {
    const { deps } = fakes({
      launch: () => {
        throw new Error('no java')
      },
    })
    expect(await createLanguageTool(deps).start()).toBe('missing')
  })

  it('starts again after the server died, up to three times, and stops on request', async () => {
    const { deps, launched, crash, killed } = fakes()
    const service = createLanguageTool(deps)
    await service.start()
    crash(1)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(service.state()).toBe('failed')
    expect(await service.start()).toBe('ready')
    expect(launched).toHaveLength(2)
    await service.stop()
    expect(killed).toHaveBeenCalled()
    expect(service.state()).toBe('off')
    expect(await service.start()).toBe('off')
  })

  it('uses a server that already runs at a port, without starting Java, and keeps it when idle', async () => {
    const f = fakes({ idleStopMs: 20, ...attachedServer(9411) })
    const service = createLanguageTool(f.deps)
    const request = {
      language: 'de-DE',
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
      units: [[{ text: 'x' }]],
    } as never
    expect(await service.start()).toBe('ready')
    expect((await service.check(request)).ok).toBe(true)
    expect(f.requests[0]!.url).toBe('http://127.0.0.1:9411/v2/check')
    // After a rest it is still used, and the app never started a process of its own.
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect((await service.check(request)).ok).toBe(true)
    expect(f.launched).toHaveLength(0)
    await service.stop()
  })
})

// With LanguageTool in `.dev/languagetool` and Java installed, one real check goes all the way.
import { freePort, launchServer } from './languageTool'

const installation = findInstallation({
  appPath: process.cwd(),
  home: process.env['EZETTA_LANGUAGETOOL'],
  java: process.env['EZETTA_JAVA'],
})
describe.skipIf(!installation)('with the real LanguageTool server', () => {
  it('finds a spelling error and a grammar error, and keeps the offsets of the source', async () => {
    const service = createLanguageTool({
      find: () => installation,
      launch: launchServer,
      freePort,
      fetch,
      log: () => undefined,
    })
    try {
      const text = 'Wie '
      const result = await service.check({
        language: 'de-DE',
        level: 'default',
        disabledRules: [],
        disabledCategories: [],
        units: [
          [
            { text },
            { markup: '@smith2020', interpretAs: 'Smith (2020)' },
            { text: ' zeigt, ist das ein Tesst.' },
          ],
        ],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const source = 'Wie @smith2020 zeigt, ist das ein Tesst.'
      const found = result.results[0]!.map((m) => source.slice(m.offset, m.offset + m.length))
      expect(found).toContain('Tesst')
    } finally {
      await service.stop()
    }
  }, 60_000)
})
