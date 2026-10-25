/** A table of a parsed TOML file (`smol-toml`): its keys and their values, still unchecked. */
export type TomlTable = Record<string, unknown>

/** True if a parsed TOML value is a table, not an array or a date (which `smol-toml` gives as a `Date`). */
export const isTable = (value: unknown): value is TomlTable =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
