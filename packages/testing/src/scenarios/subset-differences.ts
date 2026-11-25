import { isDeepStrictEqual } from 'node:util';
import { isPlainObject } from './is-plain-object';
import { show } from './show';

/**
 * Where `actual` differs from the properties `expected` names, one line each. A plain object of
 * `expected` is a subset, at any depth: in a list too, which is read position by position and
 * must have the expected number of items.
 */
export function subsetDifferences(actual: unknown, expected: unknown, path: string): string[] {
  if (isPlainObject(expected) && typeof actual === 'object' && actual !== null) {
    return Object.entries(expected).flatMap(([key, value]) => {
      // Reflect.get rather than a spread: an event class may expose a property through a getter.
      const recorded: unknown = Reflect.get(actual, key);

      return subsetDifferences(recorded, value, `${path}.${key}`);
    });
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length
      ? expected.flatMap((item, index) => subsetDifferences(actual[index], item, `${path}[${index}]`))
      : [`${path}: expected ${items(expected.length)}, recorded ${items(actual.length)}: ${show(actual)}`];
  }

  return isDeepStrictEqual(actual, expected) ? [] : [`${path}: expected ${show(expected)}, recorded ${show(actual)}`];
}

function items(n: number): string {
  return `${n} item${n === 1 ? '' : 's'}`;
}
