import { InMemoryOutboxStore, type OutboxRecord } from '../../src';

/** An in-memory store that counts the claims it is asked for: one per tick of a relay. */
export class CountingStore extends InMemoryOutboxStore {
  claims = 0;

  override async claimBatch(limit: number, now: Date): Promise<OutboxRecord[]> {
    this.claims += 1;

    return super.claimBatch(limit, now);
  }
}
