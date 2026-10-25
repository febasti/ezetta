import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside } from './paths'

const root = resolve('/tmp/project')

describe('isInside', () => {
  it('accepts files below the root', () => {
    expect(isInside(root, resolve(root, 'assets/a.png'))).toBe(true)
  })
  it('rejects the root itself and its siblings', () => {
    expect(isInside(root, root)).toBe(false)
    expect(isInside(root, resolve('/tmp/project-other/a.png'))).toBe(false)
  })
  it('rejects traversal out of the root', () => {
    expect(isInside(root, resolve(root, '../secret.txt'))).toBe(false)
    expect(isInside(root, resolve(root, 'assets/../../secret.txt'))).toBe(false)
  })
})
