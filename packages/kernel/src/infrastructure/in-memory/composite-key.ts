/**
 * The key of a map for what several values identify together. JSON keeps the parts apart:
 * `'a:b'` with `'c'` must not be the key of `'a'` with `'b:c'`.
 */
export function compositeKey(...parts: readonly string[]): string {
  return JSON.stringify(parts);
}
