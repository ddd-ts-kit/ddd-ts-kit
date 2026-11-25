import { isDeepStrictEqual } from 'node:util';
import { counted } from './counted';
import { isPlainObject } from './is-plain-object';
import { show } from './show';

/** Where a difference is, and the word for what was found there: an event is `recorded`, a command `decided`. */
export interface Compared {
  readonly path: string;
  readonly verb: string;
}

/**
 * Where `actual` differs from the properties `expected` names, one line each. A plain object of
 * `expected` is a subset, at any depth: in a list too, which is read position by position and
 * must have the expected number of items.
 */
export function subsetDifferences(actual: unknown, expected: unknown, { path, verb }: Compared): string[] {
  if (isPlainObject(expected) && typeof actual === 'object' && actual !== null) {
    // Reflect.get rather than a spread: an event class may expose a property through a getter.
    return Object.entries(expected).flatMap(([key, value]) =>
      subsetDifferences(Reflect.get(actual, key), value, { path: `${path}.${key}`, verb }),
    );
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length
      ? expected.flatMap((item, index) => subsetDifferences(actual[index], item, { path: `${path}[${index}]`, verb }))
      : [
          `${path}: expected ${counted(expected.length, 'item')}, ${verb} ${counted(actual.length, 'item')}: ${show(actual)}`,
        ];
  }

  return isDeepStrictEqual(actual, expected) ? [] : [`${path}: expected ${show(expected)}, ${verb} ${show(actual)}`];
}
