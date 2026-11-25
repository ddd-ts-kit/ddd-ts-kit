import { lazy } from './lazy';
import { restartedWithTestData } from './restart-test-data';
import type { Resolvable } from './resolvable';

const counters = new Map<string, number>();

/**
 * A default drawn from a named, deterministic sequence: `sequence('order')` gives `order-1`,
 * `order-2`... The counter is shared by every builder using the same name.
 */
export function sequence(name: string): Resolvable<string>;
export function sequence<T>(name: string, format: (n: number) => T): Resolvable<T>;

export function sequence(name: string, format: (n: number) => unknown = (n) => `${name}-${n}`): Resolvable<unknown> {
  return lazy(() => {
    const next = (counters.get(name) ?? 0) + 1;

    counters.set(name, next);

    return format(next);
  });
}

/**
 * Restarts every sequence at 1, so that tests do not depend on their order. The setup entries of
 * the package do it before each test (`restartTestData`); call it in `beforeEach` without them.
 */
export function resetSequences(): void {
  counters.clear();
}

restartedWithTestData(resetSequences);
