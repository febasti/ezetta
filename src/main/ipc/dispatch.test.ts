import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineInvoke } from '@shared/ipc'
import { dispatch } from './dispatch'

const def = defineInvoke(
  'test:echo',
  z.object({ n: z.number() }).strict(),
  z.object({ n: z.number() }),
)
const trustedOrigins = ['app://renderer']
const trusted = { senderUrl: 'app://renderer/index.html', trustedOrigins }
const log = vi.fn()

describe('dispatch', () => {
  it('runs the handler for a valid request from a trusted sender', async () => {
    const result = await dispatch(
      def,
      ({ n }: { n: number }) => ({ n: n + 1 }),
      { ...trusted, payload: { n: 1 } },
      log,
    )
    expect(result).toEqual({ ok: true, value: { n: 2 } })
  })
  it('rejects untrusted senders without running the handler', async () => {
    const handler = vi.fn()
    const result = await dispatch(
      def,
      handler,
      { senderUrl: 'https://evil.example/', trustedOrigins, payload: { n: 1 } },
      log,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(handler).not.toHaveBeenCalled()
  })
  it('rejects a missing sender frame', async () => {
    const result = await dispatch(
      def,
      vi.fn(),
      { senderUrl: null, trustedOrigins, payload: { n: 1 } },
      log,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
  it('rejects invalid and extra fields', async () => {
    const handler = vi.fn()
    expect(await dispatch(def, handler, { ...trusted, payload: { n: 'x' } }, log)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    expect(
      await dispatch(def, handler, { ...trusted, payload: { n: 1, extra: true } }, log),
    ).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    expect(handler).not.toHaveBeenCalled()
  })
  it('turns a thrown error into a typed result without leaking its message', async () => {
    const result = await dispatch(
      def,
      () => {
        throw new Error('secret path /Users/x')
      },
      { ...trusted, payload: { n: 1 } },
      log,
    )
    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'Internal error' } })
  })
  it('rejects a handler response that breaks the contract', async () => {
    const result = await dispatch(
      def,
      () => ({ n: 'nope' }),
      { ...trusted, payload: { n: 1 } },
      log,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})
