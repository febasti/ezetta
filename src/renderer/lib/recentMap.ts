/**
 * A map that holds at most `limit` entries and lets go of the least recently used one first. `get`
 * counts as a use. For caches that must not grow over a long session, and must not be emptied all
 * at once either, which would ask for everything again.
 */
export class RecentMap<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.entries.size
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    // A Map keeps the order of insertion: moved to the end, the entry is the newest.
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break
      this.entries.delete(oldest)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
