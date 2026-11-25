/**
 * A value as JSON carries it to another process and back: a copy, where a `Date` is its text, a
 * class instance a plain object and an `undefined` property is gone. What JSON cannot carry (a
 * bigint, a cycle) is refused with the `TypeError` of `JSON.stringify`, as a broker or a shared
 * cache refuses it. The in-memory cache and event bus hand values this way, so that a spec green
 * on them holds behind the real ones.
 */
export function asJsonCarries(value: unknown): unknown {
  const carried: unknown = value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  return carried;
}
