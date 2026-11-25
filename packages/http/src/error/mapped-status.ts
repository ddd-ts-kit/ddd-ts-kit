import type { ErrorMapping } from './error-mapping';

/**
 * The status the mapping itself gives a code, `undefined` when it names none. A code is data, a
 * text an error carries: it is never read among what every object inherits (`constructor`,
 * `toString`).
 */
export function mappedStatus(mapping: ErrorMapping, code: string): number | undefined {
  return Object.hasOwn(mapping, code) ? mapping[code] : undefined;
}
