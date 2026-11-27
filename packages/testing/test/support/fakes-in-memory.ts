import { InMemoryOutboxStore } from '@ddd-ts-kit/events';
import { AggregateRoot, InMemoryUnitOfWork, atCommit } from '@ddd-ts-kit/kernel';
import type { UnitOfWorkUnderContract } from '../../src/contracts';
import { InMemoryRepository } from '../../src';

/** A row of the table: an aggregate that is only its id. */
class Row extends AggregateRoot {
  static of(id: string): Row {
    return new Row(id);
  }
}

/**
 * The fakes every handler spec runs on, as a database: `InMemoryUnitOfWork` over an
 * `InMemoryRepository` for the table and an `InMemoryOutboxStore`. No isolation, so no view from
 * another connection.
 */
export class FakesInMemory implements UnitOfWorkUnderContract {
  readonly unitOfWork = new InMemoryUnitOfWork();

  readonly outbox = new InMemoryOutboxStore();

  private readonly rows = new InMemoryRepository<Row>({ clone: (row) => Row.of(row.id) });

  async insert(id: string): Promise<void> {
    await this.rows.save(Row.of(id));
  }

  /** What the database checks at commit is, in memory, a step that refuses at the commit. */
  async insertRefusedAtCommit(id: string): Promise<void> {
    await this.insert(id);

    await atCommit({
      apply: () => Promise.reject(new Error('a deferred constraint is violated')),
      undo: () => Promise.resolve(),
    });
  }

  async ids(): Promise<string[]> {
    return this.rows
      .all()
      .map((row) => row.id)
      .sort();
  }
}
