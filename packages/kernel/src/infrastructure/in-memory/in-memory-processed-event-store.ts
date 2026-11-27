import type { ProcessedEventStore } from '../../application/ports/processed-event-store';
import { onRollback } from '../domain-events/on-rollback';
import { compositeKey } from './composite-key';

/** The marks in memory: one taken inside a unit of work that rolls back is given back with it. */
export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly seen = new Set<string>();

  async markProcessed(consumer: string, eventId: string): Promise<boolean> {
    const key = compositeKey(consumer, eventId);

    if (this.seen.has(key)) {
      return false;
    }

    this.seen.add(key);
    onRollback(() => this.seen.delete(key));

    return true;
  }

  async release(consumer: string, eventId: string): Promise<void> {
    this.seen.delete(compositeKey(consumer, eventId));
  }
}
