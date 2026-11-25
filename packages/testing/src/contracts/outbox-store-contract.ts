import type { IntegrationEvent } from '@ddd-ts-kit/kernel';
import type { Awaitable } from './awaitable';
import type { ContractRunner } from './contract-runner';
import { ContractSuite } from './contract-suite';
import { failureOf } from '../scenarios/failure-of';
import { fullEnvelope } from './full-envelope';
import { OutboxErasureSuite } from './outbox-store/outbox-erasure-suite';
import type { OutboxStoreUnderContract } from './outbox-store/outbox-store-under-contract';
import { tenantEnvelope } from './tenant-envelope';

export interface OutboxStoreContractOptions {
  readonly name: string;
  /** A fresh, empty store; called before each test. */
  createStore(): Awaitable<OutboxStoreUnderContract>;
  /** The lease the created store is configured with: how long a claim hides a record. */
  readonly leaseMs: number;
  /**
   * The store keeps the tenant of an event (`tenant_id`), as a multi-tenant project needs: its
   * consumers then run in that tenant. Default false, for a store created without the column.
   */
  readonly carriesTenant?: boolean;
}

export type { OutboxStoreUnderContract };

export function outboxStoreContract(runner: ContractRunner, options: OutboxStoreContractOptions): void {
  new OutboxStoreSuite(runner, options).describe(`${options.name} (outbox store contract)`);

  new OutboxErasureSuite(runner, () => options.createStore(), options.leaseMs).describe(
    `${options.name} (outbox store contract: the erasure of a person)`,
  );
}

const NOW = new Date('2026-03-01T10:00:00.000Z');

class OutboxStoreSuite extends ContractSuite<OutboxStoreUnderContract> {
  constructor(
    runner: ContractRunner,
    private readonly options: OutboxStoreContractOptions,
  ) {
    super(runner, () => options.createStore());
  }

  protected tests(): void {
    this.handsOutWhatWasAppended();
    this.takesNothingAsNothingToDo();
    this.returnsTheEventAsAppended();
    this.leasesWhatItHandsOut();
    this.followsTheOutcomeOfAnAttempt();
    this.postponesWithoutAnAttempt();
    this.postponesOnlyWhatWasClaimed();
    this.revivesDeadRecords();
    this.purgesAndRefusesDuplicates();
  }

  private handsOutWhatWasAppended(): void {
    this.it('starts empty', async () => {
      this.expect(await this.subject.stats()).toEqual({ pending: 0, failed: 0, dead: 0 });
      this.expect(await this.subject.claimBatch(10, NOW)).toEqual([]);
    });

    this.it('hands out the appended events oldest first and counts the attempt', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2')]);
      await this.subject.append([outboxEvent('evt-3')]);
      this.expect(await this.subject.stats()).toEqual({ pending: 3, failed: 0, dead: 0 });

      const claimed = await this.subject.claimBatch(10, NOW);

      this.expect(claimed.map((record) => record.event.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
      this.expect(claimed.map((record) => record.attempts)).toEqual([1, 1, 1]);
      this.expect(claimed.map((record) => record.status)).toEqual(['pending', 'pending', 'pending']);
    });
  }

  private takesNothingAsNothingToDo(): void {
    this.it('takes an empty batch, an empty publication and an empty revival as nothing to do', async () => {
      await this.subject.append([]);
      await this.subject.markPublished([], NOW);

      this.expect(await this.subject.retryDead([], NOW)).toBe(0);
      this.expect(await this.subject.stats()).toEqual({ pending: 0, failed: 0, dead: 0 });
      this.expect(await this.subject.claimBatch(10, NOW)).toEqual([]);
    });
  }

  private returnsTheEventAsAppended(): void {
    this.it('returns the event exactly as appended, trace and correlation included', async () => {
      const appended = (this.options.carriesTenant === true ? tenantEnvelope : fullEnvelope)(outboxEvent('evt-1'));

      await this.subject.append([appended, outboxEvent('evt-2')]);

      const claimed = await this.subject.claimBatch(10, NOW);

      this.expect(claimed[0]?.event).toEqual(appended);
      this.expect(claimed[1]?.event).toEqual(outboxEvent('evt-2'));
      this.expect(claimed[1]?.event.traceparent).toBe(undefined);
      this.expect(claimed[1]?.event.correlationId).toBe(undefined);
      this.expect(claimed[1]?.event.tenantId).toBe(undefined);
    });
  }

  private leasesWhatItHandsOut(): void {
    this.it('honours the limit and leaves the rest to the next claim', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2'), outboxEvent('evt-3')]);

      this.expect(await this.claimedIds(2, NOW)).toEqual(['evt-1', 'evt-2']);
      this.expect(await this.claimedIds(2, NOW)).toEqual(['evt-3']);
    });

    this.it('hides a claimed record until its lease expires, then hands it out again', async () => {
      await this.subject.append([outboxEvent('evt-1')]);
      const claimed = await this.subject.claimBatch(10, NOW);

      this.expect(await this.claimedIds(10, NOW)).toEqual([]);
      this.expect(await this.claimedIds(10, later(this.options.leaseMs - 1))).toEqual([]);

      this.expect(claimed[0]?.nextAttemptAt).toEqual(later(this.options.leaseMs));

      const again = await this.subject.claimBatch(10, later(this.options.leaseMs));

      this.expect(again.map((record) => record.event.id)).toEqual(['evt-1']);
      this.expect(again[0]?.attempts).toBe(2);
    });

    this.it('never hands the same record to two concurrent claims', async () => {
      await this.subject.append(['1', '2', '3', '4', '5', '6'].map((n) => outboxEvent(`evt-${n}`)));

      const batches = await Promise.all([this.claimedIds(4, NOW), this.claimedIds(4, NOW)]);

      const ids = batches.flat();

      this.expect(ids.length).toBe(6);
      this.expect(new Set(ids).size).toBe(6);
    });
  }

  private followsTheOutcomeOfAnAttempt(): void {
    this.it('never hands out a published record again', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2')]);
      await this.subject.claimBatch(10, NOW);

      await this.subject.markPublished(['evt-1'], NOW);

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 0 });
      this.expect(await this.claimedIds(10, later(this.options.leaseMs * 10))).toEqual(['evt-2']);
    });

    this.it('leaves a published record published whatever is reported of it, and knows no unknown id', async () => {
      await this.subject.append([outboxEvent('evt-1')]);
      await this.subject.claimBatch(10, NOW);
      await this.subject.markPublished(['evt-1'], NOW);

      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, null);
      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, later(5_000));
      await this.subject.markFailed('unknown', { code: 'BROKER_DOWN' }, null);

      this.expect(await this.subject.stats()).toEqual({ pending: 0, failed: 0, dead: 0 });
      this.expect(await this.subject.claimBatch(10, later(this.options.leaseMs * 10))).toEqual([]);
      this.expect(await this.subject.purgePublished(later(1_000))).toBe(1);
    });

    this.it('retries a failed record at its next attempt, not before', async () => {
      await this.subject.append([outboxEvent('evt-1')]);
      await this.subject.claimBatch(10, NOW);

      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, later(5_000));

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 1, dead: 0 });
      this.expect(await this.claimedIds(10, later(4_999))).toEqual([]);
      const retried = await this.subject.claimBatch(10, later(5_000));

      this.expect(retried.map((record) => record.event.id)).toEqual(['evt-1']);
      this.expect(retried[0]?.attempts).toBe(2);
      this.expect(retried[0]?.lastErrorCode).toBe('BROKER_DOWN');
    });
  }

  private postponesWithoutAnAttempt(): void {
    this.it('postpones a claimed record: the claim is not an attempt, and it is not a failure', async () => {
      await this.subject.append([outboxEvent('evt-1')]);
      await this.subject.claimBatch(10, NOW);

      await this.subject.postpone('evt-1', later(5_000));

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 0 });
      this.expect(await this.claimedIds(10, later(4_999))).toEqual([]);
      const again = await this.subject.claimBatch(10, later(5_000));

      this.expect(again.map((record) => record.event.id)).toEqual(['evt-1']);
      this.expect(again[0]?.attempts).toBe(1);
      this.expect(again[0]?.lastErrorCode).toBe(undefined);
    });

    this.it('keeps the last failure of a record it postpones', async () => {
      await this.subject.append([outboxEvent('evt-1')]);
      await this.subject.claimBatch(10, NOW);
      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, later(1_000));
      await this.subject.claimBatch(10, later(1_000));

      await this.subject.postpone('evt-1', later(5_000));

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 1, dead: 0 });
      const again = await this.subject.claimBatch(10, later(5_000));

      this.expect(again[0]?.attempts).toBe(2);
      this.expect(again[0]?.lastErrorCode).toBe('BROKER_DOWN');
    });
  }

  private postponesOnlyWhatWasClaimed(): void {
    this.it('postpones no record that is published, dead, never claimed or unknown', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2'), outboxEvent('evt-3')]);
      await this.subject.claimBatch(2, NOW);
      await this.subject.markPublished(['evt-1'], NOW);
      await this.subject.markFailed('evt-2', { code: 'BROKER_DOWN' }, null);

      for (const id of ['evt-1', 'evt-2', 'evt-3', 'unknown']) {
        await this.subject.postpone(id, later(this.options.leaseMs * 10));
      }

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 1 });
      const claimed = await this.subject.claimBatch(10, NOW);

      this.expect(claimed.map((record) => record.event.id)).toEqual(['evt-3']);
      this.expect(claimed[0]?.attempts).toBe(1);
      this.expect(await this.subject.purgePublished(later(1_000))).toBe(1);
    });
  }

  private revivesDeadRecords(): void {
    this.it('sets a dead record aside for good', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2')]);
      await this.subject.claimBatch(10, NOW);

      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, null);

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 1 });
      this.expect(await this.claimedIds(10, later(this.options.leaseMs * 10))).toEqual(['evt-2']);
    });

    this.it('puts dead records back in the queue with a fresh attempt budget', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2')]);
      await this.subject.claimBatch(10, NOW);
      await this.subject.markFailed('evt-1', { code: 'BROKER_DOWN' }, null);
      await this.subject.markPublished(['evt-2'], NOW);

      const revivedCount = await this.subject.retryDead(['evt-1', 'evt-2', 'unknown'], later(1_000));

      this.expect(revivedCount).toBe(1);

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 1, dead: 0 });
      this.expect(await this.claimedIds(10, later(999))).toEqual([]);
      const revived = await this.subject.claimBatch(10, later(1_000));

      this.expect(revived.map((record) => record.event.id)).toEqual(['evt-1']);
      this.expect(revived[0]?.attempts).toBe(1);
    });
  }

  private purgesAndRefusesDuplicates(): void {
    this.it('purges only what was published before the given instant', async () => {
      await this.subject.append([outboxEvent('evt-1'), outboxEvent('evt-2'), outboxEvent('evt-3')]);
      await this.subject.claimBatch(10, NOW);
      await this.subject.markPublished(['evt-1'], NOW);
      await this.subject.markPublished(['evt-2'], later(1_000));

      this.expect(await this.subject.purgePublished(NOW)).toBe(0);
      this.expect(await this.subject.purgePublished(later(1_000))).toBe(1);

      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 0 });
      this.expect(await this.subject.purgePublished(later(2_000))).toBe(1);
    });

    this.it('refuses an event id it already holds, and nothing of that batch gets in', async () => {
      await this.subject.append([outboxEvent('evt-1')]);

      const batch = [outboxEvent('evt-2'), outboxEvent('evt-1')];
      const failure = await failureOf(() => this.subject.append(batch));

      this.holds(failure !== undefined, 'a batch with an event id the store already holds was accepted');
      this.expect(await this.subject.stats()).toEqual({ pending: 1, failed: 0, dead: 0 });
    });
  }

  private async claimedIds(limit: number, at: Date): Promise<string[]> {
    return (await this.subject.claimBatch(limit, at)).map((record) => record.event.id);
  }
}

function later(ms: number): Date {
  return new Date(NOW.getTime() + ms);
}

function outboxEvent(id: string): IntegrationEvent {
  return {
    id,
    type: 'contract.thing.happened',
    version: 1,
    occurredAt: '2026-03-01T09:59:59.000Z',
    payload: { thingId: `thing-${id}` },
  };
}
