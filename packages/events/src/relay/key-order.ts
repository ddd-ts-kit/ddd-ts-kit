import type { ClaimWindow } from './claim-window';
import type { EventKey } from './event-key';
import type { HoldUntil } from './hold-until';
import type { KeyedRecord } from './keyed-record';
import type { RecordGroup } from './record-group';

interface Head {
  readonly eventId: string;
  readonly until: HoldUntil;
}

/**
 * What a relay remembers to keep the records of one key in order: which record is at the
 * head of each key, and in which order it first saw the others. Kept in memory: it holds for
 * one relay as long as it lives.
 */
export class KeyOrder<R extends KeyedRecord> {
  private readonly heads = new Map<string, Head>();

  private readonly arrivals = new Map<string, number>();

  private seen = 0;

  constructor(private readonly keyOf: EventKey) {}

  /** One group per key, earliest seen first inside it; a record without key stands alone. */
  groups(records: readonly R[]): RecordGroup<R>[] {
    const byKey = new Map<string, R[]>();
    const groups: RecordGroup<R>[] = [];

    for (const record of records) {
      const key = this.keyOf(record.event);
      const siblings = key === undefined ? undefined : byKey.get(key);

      if (siblings !== undefined) {
        siblings.push(record);
        continue;
      }

      const members = [record];

      groups.push({ key, records: members });

      if (key !== undefined) {
        byKey.set(key, members);
      }
    }

    for (const members of byKey.values()) {
      this.sortByArrival(members);
    }

    return groups;
  }

  /** Until when the group waits because an earlier record of its key is still to publish. */
  holdOf(group: RecordGroup<R>, window: ClaimWindow): HoldUntil | undefined {
    const head = group.key === undefined ? undefined : this.heads.get(group.key);

    if (group.key === undefined || head === undefined) {
      return undefined;
    }

    if (group.records.some((record) => record.event.id === head.eventId)) {
      return undefined;
    }

    // Due, yet absent from a claim that took everything due: it left the queue another way.
    if (head.until !== 'lease-expiry' && window.complete && head.until <= window.now) {
      this.heads.delete(group.key);

      return undefined;
    }

    return head.until;
  }

  block(key: string | undefined, eventId: string, until: Date): void {
    if (key !== undefined) {
      this.heads.set(key, { eventId, until });
    }
  }

  /** The record was published or declared dead: it no longer stands in the way. */
  settle(key: string | undefined, eventId: string): void {
    this.arrivals.delete(eventId);

    if (key !== undefined && this.heads.get(key)?.eventId === eventId) {
      this.heads.delete(key);
    }
  }

  /**
   * After an aborted tick, the records it claimed and did not settle are leased by the store
   * for a time the relay does not know: each key waits for its first such record to come back.
   */
  suspend(groups: readonly RecordGroup<R>[], settled: ReadonlySet<string>): void {
    for (const { key, records } of groups) {
      const unsettled = records.filter((record) => !settled.has(record.event.id));
      const head = key === undefined ? undefined : this.heads.get(key);

      const blocker =
        unsettled.find((record) => record.event.id === head?.eventId) ??
        (head === undefined ? unsettled[0] : undefined);

      if (key !== undefined && blocker !== undefined) {
        this.heads.set(key, { eventId: blocker.event.id, until: 'lease-expiry' });
      }
    }
  }

  private sortByArrival(members: R[]): void {
    for (const { event } of members) {
      if (!this.arrivals.has(event.id)) {
        this.seen += 1;
        this.arrivals.set(event.id, this.seen);
      }
    }

    members.sort((a, b) => this.arrivalOf(a) - this.arrivalOf(b));
  }

  private arrivalOf(record: R): number {
    return this.arrivals.get(record.event.id) ?? 0;
  }
}
