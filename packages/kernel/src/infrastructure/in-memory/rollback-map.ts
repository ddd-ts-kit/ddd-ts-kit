import { onRollback } from '../domain-events/on-rollback';

/** What a key held before a write: nothing (an `undefined` it held included), or its value. */
type Found<V> = { readonly value: V } | undefined;

/**
 * The Map of a store in memory: a `set` or a `delete` made inside a unit of work is undone when it
 * rolls back (`onRollback`), so a failed command leaves each key as it found it, as a transaction
 * would. A key a later write changed since is left as it is: what a command running alongside
 * committed stays. There is no isolation: every write is seen at once.
 */
export class RollbackMap<K, V> extends Map<K, V> {
  /** The entries it starts with are no write: a rollback leaves them. */
  constructor(entries: Iterable<readonly [K, V]> = []) {
    // The constructor of a Map would hand them to `set`.
    super();

    for (const [key, value] of entries) {
      super.set(key, value);
    }
  }

  override set(key: K, value: V): this {
    const found = this.found(key);

    super.set(key, value);

    onRollback(() => {
      if (this.get(key) === value) {
        this.putBack(key, found);
      }
    });

    return this;
  }

  override delete(key: K): boolean {
    const found = this.found(key);

    if (!super.delete(key)) {
      return false;
    }

    onRollback(() => {
      if (!this.has(key)) {
        this.putBack(key, found);
      }
    });

    return true;
  }

  private found(key: K): Found<V> {
    const value = this.get(key);

    return value === undefined ? undefined : { value };
  }

  private putBack(key: K, found: Found<V>): void {
    if (found === undefined) {
      super.delete(key);
    } else {
      super.set(key, found.value);
    }
  }
}
