import { FixedClock } from '@ddd-ts-kit/kernel';
import { describe, expect, it } from 'vitest';
import { InMemoryOutboxStore, OutboxRelay, type OutboxRelayFailure } from '../src';
import { at } from './support/events';
import { FlakyPublisher } from './support/flaky-publisher';
import { invoiceIssuedEvent as event } from './support/invoice-issued-event';

class FailureNotRecorded extends Error {
  readonly code = 'FAILURE_NOT_RECORDED';
}

class PublicationNotRecorded extends Error {
  readonly code = 'PUBLICATION_NOT_RECORDED';
}

/** A store that went away mid-batch: it records neither a failure nor, when told so, a publication. */
class StoreGoneMidBatch extends InMemoryOutboxStore {
  constructor(private readonly recordsPublications: boolean) {
    super();
  }

  override async markFailed(): Promise<void> {
    throw new FailureNotRecorded();
  }

  override async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (!this.recordsPublications) {
      throw new PublicationNotRecorded();
    }

    await super.markPublished(ids, publishedAt);
  }
}

function relayOver(store: InMemoryOutboxStore): { relay: OutboxRelay; reported: OutboxRelayFailure[] } {
  const reported: OutboxRelayFailure[] = [];

  const relay = new OutboxRelay({
    store,
    publisher: new FlakyPublisher({ 'evt-2': 1 }),
    clock: new FixedClock(at),
    onFailure: (failure) => reported.push(failure),
  });

  return { relay, reported };
}

describe('OutboxRelay.tick when the store fails mid-batch', () => {
  it('still marks what went out, so it does not go out twice for that', async () => {
    const store = new StoreGoneMidBatch(true);
    const { relay } = relayOver(store);

    await store.append([event('evt-1'), event('evt-2')]);

    await expect(relay.tick()).rejects.toBeInstanceOf(FailureNotRecorded);
    expect(store.records().map((record) => record.status)).toEqual(['published', 'pending']);
  });

  it('rejects with the first failure and reports the publications it could not mark either', async () => {
    const store = new StoreGoneMidBatch(false);
    const { relay, reported } = relayOver(store);

    await store.append([event('evt-1'), event('evt-2')]);

    await expect(relay.tick()).rejects.toBeInstanceOf(FailureNotRecorded);
    expect(reported).toContainEqual({ kind: 'tick', code: 'PUBLICATION_NOT_RECORDED' });
  });
});
