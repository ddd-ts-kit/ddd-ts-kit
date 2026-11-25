import { ConcurrencyError, type AggregateRoot, type ExecutionScope, type Repository } from '@ddd-ts-kit/kernel';
import { UNCONFINED, confinedTo, type Confinement, type Owner } from './confinement';
import type { SnapshotCodec } from './snapshot-codec';

/**
 * How the fake keeps its own copy, so that mutating an aggregate after `save` (or a loaded
 * one before saving it) never changes what is stored. Either a `clone` function, or the
 * snapshot pair a real adapter's mapper already has; snapshots go through `structuredClone`.
 */
export type InMemoryRepositoryOptions<A> = { readonly clone: (aggregate: A) => A } | SnapshotCodec<A, unknown>;

/**
 * For the fake of a tenant-scoped aggregate: `{ confinedTo: scope }` confines every read and
 * every write to the tenant of the work in progress in `scope`, as the tenant helpers of the ORM
 * packages confine the statements of the real adapter.
 */
export interface InMemoryRepositoryTenancy {
  readonly confinedTo: ExecutionScope;
}

interface Entry<A> {
  /** A new copy of the stored aggregate at each call. */
  readonly load: () => A;
  readonly version: number;
  readonly owner: Owner;
}

/**
 * A working repository over a Map: the fake of any aggregate repository port. Use it as is or
 * extend it to add the finders of the port. It enforces optimistic concurrency on `version`
 * like a real adapter, and passes the same `repositoryContract`. Confined to a scope, it keeps
 * each tenant to what it saved, under ids all tenants share as the rows of one table do, and
 * passes `tenantIsolationContract`.
 */
export class InMemoryRepository<A extends AggregateRoot<Id>, Id extends string | number = string>
  implements Repository<A, Id>
{
  private readonly entries = new Map<Id, Entry<A>>();

  private readonly keep: (aggregate: A) => () => A;

  private readonly confinement: Confinement;

  constructor(options: InMemoryRepositoryOptions<A>, tenancy?: InMemoryRepositoryTenancy) {
    this.keep = 'clone' in options ? keptByCloning(options.clone) : keptAsSnapshot(options);
    this.confinement = tenancy === undefined ? UNCONFINED : confinedTo(tenancy.confinedTo);
  }

  async findById(id: Id): Promise<A | undefined> {
    const reaches = this.confinement.reader();
    const entry = this.entries.get(id);

    return entry === undefined || !reaches(entry.owner) ? undefined : this.revive(entry);
  }

  async save(aggregate: A): Promise<void> {
    const owner = this.confinement.writer();
    const held = this.entries.get(aggregate.id);
    const current = held?.version ?? 0;

    // What another tenant holds is refused as a stale save is: the id is taken and the row is not the writer's.
    if (aggregate.version !== current || (held !== undefined && held.owner !== owner)) {
      throw new ConcurrencyError(aggregate.id);
    }

    const version = current + 1;

    this.entries.set(aggregate.id, { load: this.keep(aggregate), version, owner });
    aggregate.version = version;
  }

  /** Copies of every stored aggregate the work in progress may read, in insertion order, for assertions and finders. */
  all(): A[] {
    return this.reached().map((entry) => this.revive(entry));
  }

  /** How many aggregates the work in progress may read. */
  count(): number {
    return this.reached().length;
  }

  /** Forgets everything, of every tenant. */
  clear(): void {
    this.entries.clear();
  }

  /** For subclasses whose port has a removal method: removes what the work in progress may write, and nothing else. */
  protected remove(id: Id): boolean {
    return this.entries.get(id)?.owner === this.confinement.writer() && this.entries.delete(id);
  }

  private reached(): Entry<A>[] {
    const reaches = this.confinement.reader();

    return [...this.entries.values()].filter((entry) => reaches(entry.owner));
  }

  private revive(entry: Entry<A>): A {
    const aggregate = entry.load();

    aggregate.version = entry.version;

    return aggregate;
  }
}

function keptByCloning<A>(clone: (aggregate: A) => A): (aggregate: A) => () => A {
  return (aggregate) => {
    const stored = clone(aggregate);

    return () => clone(stored);
  };
}

function keptAsSnapshot<A>(codec: SnapshotCodec<A, unknown>): (aggregate: A) => () => A {
  return (aggregate) => {
    const stored = structuredClone(codec.toSnapshot(aggregate));

    return () => codec.fromSnapshot(structuredClone(stored));
  };
}
