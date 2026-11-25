import type { Kind } from '../generate/kind';
import { writesInAContext } from '../generate/writes-in-a-context';

/**
 * The kinds a worker confined to one context may run: those of a context that write nothing
 * shared, and those that have a way not to (a decision record of its slices, for one).
 */
export function workerGenerators(kinds: readonly Kind[]): string[] {
  return kinds
    .filter((kind) => writesInAContext(kind) || kind.shared?.worker !== undefined)
    .flatMap((kind) => {
      if (kind.shared === undefined) {
        return [kind.name];
      }

      const allowed = kind.shared.worker;

      return allowed === undefined ? [] : [`${kind.name} (${allowed})`];
    });
}
