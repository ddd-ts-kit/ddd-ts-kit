import type { Awaitable } from './awaitable';
import type { ContractRunner } from './contract-runner';
import type { EventStoreInUnitOfWork } from './event-store/event-store-in-unit-of-work';
import { OneTransactionSuite } from './event-store/one-transaction-suite';

export interface EventStoreUnitOfWorkContractOptions {
  readonly name: string;
  /** An empty event store and an empty outbox of one database, bound to one unit of work; called before each test. */
  createStoreInUnitOfWork(): Awaitable<EventStoreInUnitOfWork>;
}

/**
 * No double write for an event-sourced aggregate: what its save appends to its stream and what the
 * publisher of its events writes to the outbox commit in one transaction, so nothing is published
 * for an append that was rolled back or refused. Held by every transactional event store.
 */
export function eventStoreUnitOfWorkContract(
  runner: ContractRunner,
  options: EventStoreUnitOfWorkContractOptions,
): void {
  new OneTransactionSuite(runner, () => options.createStoreInUnitOfWork()).describe(
    `${options.name} (event store contract: one transaction with the outbox)`,
  );
}
