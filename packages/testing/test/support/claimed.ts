import type { IntegrationEvent } from '@ddd-ts-kit/kernel';
import type { OutboxStoreUnderContract } from '../../src/contracts';

type ClaimedRecord = Awaited<ReturnType<OutboxStoreUnderContract['claimBatch']>>[number];

/** A record as a first claim hands it out, for the outbox of a database in memory. */
export function claimed(event: IntegrationEvent): ClaimedRecord {
  return { event, status: 'pending', attempts: 1, nextAttemptAt: new Date(0) };
}
