import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { findInstallation } from './languageTool'
import { createMorph, launchMorph, prepareMorph } from './morph'
import type { MorphProcess } from './morph'

function fakeProcess(answer: (request: { id: number; op: string }) => unknown): {
  process: MorphProcess
  sent: string[]
  crash: () => void
} {
  const listeners: ((line: string) => void)[] = []
  const sent: string[] = []
  let exit: (code: number | null) => void = () => undefined
  const process: MorphProcess = {
    send: (line) => {
      sent.push(line)
      const reply = answer(JSON.parse(line))
      if (reply !== undefined)
        queueMicrotask(() => listeners.forEach((l) => l(JSON.stringify(reply))))
    },
    onLine: (l) => void listeners.push(l),
    exited: new Promise((r) => (exit = r)),
    kill: () => exit(143),
  }
  return { process, sent, crash: () => exit(1) }
}

const installation = { java: 'java', home: '/lt' }

describe('createMorph', () => {
  it('starts on the first question, and matches the answers to the questions', async () => {
    const fake = fakeProcess(({ id, op }) =>
      op === 'analyze'
        ? { id, ok: true, token: 'x', readings: [{ lemma: 'Ergebnis', tag: 'SUB:NOM:PLU:NEU' }] }
        : {
            id,
            ok: true,
            results: [{ word: 'Resultat', byTag: { NNS: [{ form: 'Resultate' }] } }],
          },
    )
    const launch = vi.fn(() => fake.process)
    const morph = createMorph({
      find: () => ({ installation, classes: '/c' }),
      launch,
      log: () => undefined,
    })
    expect(launch).not.toHaveBeenCalled()
    expect(await morph.analyze('de-DE', 'Die Ergebnisse', 4, 14)).toEqual([
      { lemma: 'Ergebnis', tag: 'SUB:NOM:PLU:NEU' },
    ])
    expect(await morph.inflect('de-DE', ['NNS'], ['Resultat'])).toEqual([
      { word: 'Resultat', byTag: { NNS: [{ form: 'Resultate' }] } },
    ])
    expect(launch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fake.sent[0]!)).toMatchObject({ op: 'analyze', language: 'de-DE', from: 4 })
  })

  it('stops the helper when it has not been asked for a while, and starts it again for the next question', async () => {
    const fakes: ReturnType<typeof fakeProcess>[] = []
    const launch = vi.fn(() => {
      const fake = fakeProcess(({ id }) => ({ id, ok: true, readings: [{ lemma: 'a', tag: 'b' }] }))
      fakes.push(fake)
      return fake.process
    })
    const morph = createMorph({
      find: () => ({ installation, classes: '/c' }),
      launch,
      log: () => undefined,
      idleStopMs: 30,
    })
    expect(await morph.analyze('de-DE', 'x', 0, 1)).toEqual([{ lemma: 'a', tag: 'b' }])
    await new Promise((resolve) => setTimeout(resolve, 120))
    // It stopped by itself ...
    await expect(fakes[0]!.process.exited).resolves.toBe(143)
    // ... and a new question starts another one.
    expect(await morph.analyze('de-DE', 'x', 0, 1)).toEqual([{ lemma: 'a', tag: 'b' }])
    expect(launch).toHaveBeenCalledTimes(2)
    morph.stop()
  })

  it('answers null when nothing is installed, when it cannot be prepared, or when it does not answer', async () => {
    const none = createMorph({
      find: () => null,
      launch: () => fakeProcess(() => undefined).process,
      log: () => undefined,
    })
    expect(await none.analyze('de-DE', 'x', 0, 1)).toBeNull()
    const unprepared = createMorph({
      find: () => ({ installation, classes: '/c' }),
      prepare: () => Promise.resolve(false),
      launch: () => fakeProcess(() => undefined).process,
      log: () => undefined,
    })
    expect(await unprepared.inflect('de-DE', ['x'], ['y'])).toBeNull()
    const silent = createMorph({
      find: () => ({ installation, classes: '/c' }),
      launch: () => fakeProcess(() => undefined).process,
      log: () => undefined,
      timeoutMs: 20,
    })
    expect(await silent.analyze('de-DE', 'x', 0, 1)).toBeNull()
  })

  it('answers null for a reply it does not understand, and for a process that dies', async () => {
    const odd = createMorph({
      find: () => ({ installation, classes: '/c' }),
      launch: () => fakeProcess(({ id }) => ({ id, ok: false })).process,
      log: () => undefined,
    })
    expect(await odd.analyze('de-DE', 'x', 0, 1)).toBeNull()
    const dying = fakeProcess(() => undefined)
    const morph = createMorph({
      find: () => ({ installation, classes: '/c' }),
      launch: () => dying.process,
      log: () => undefined,
      timeoutMs: 5000,
    })
    const pending = morph.analyze('de-DE', 'x', 0, 1)
    await new Promise((r) => setTimeout(r, 5))
    dying.crash()
    expect(await pending).toBeNull()
  })
})

// With LanguageTool, Java, and a JDK, the real helper is compiled and asked.
const real = findInstallation({ appPath: process.cwd() })
describe.skipIf(!real)('with the real helper', () => {
  it('finds the base form of an inflected word and inflects a synonym like it', async () => {
    const classes = resolve('.dev/morph')
    expect(
      await prepareMorph({
        source: resolve('tools/morph/Morph.java'),
        out: classes,
        installation: real!,
      }),
    ).toBe(true)
    expect(existsSync(resolve(classes, 'Morph.class'))).toBe(true)
    const morph = createMorph({
      find: () => ({ installation: real!, classes }),
      launch: launchMorph,
      log: () => undefined,
    })
    try {
      const text = 'Die Ergebnisse zeigten es.'
      const readings = await morph.analyze('de-DE', text, 4, 14)
      expect(readings?.map((r) => r.lemma)).toContain('Ergebnis')
      const tag = readings!.find((r) => r.tag.startsWith('SUB:NOM:PLU'))!.tag
      const forms = await morph.inflect('de-DE', [tag], ['Resultat'])
      expect(forms![0]!.byTag[tag]![0]!.form).toBe('Resultate')
    } finally {
      morph.stop()
    }
  }, 90_000)
})
