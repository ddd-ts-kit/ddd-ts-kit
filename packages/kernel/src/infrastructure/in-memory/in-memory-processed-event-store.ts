import type { ProcessedEventStore } from '../../application/ports/processed-event-store';
import { compositeKey } from './composite-key';

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly seen = new Set<string>();

  async markProcessed(consumer: string, eventId: string): Promise<boolean> {
    const key = compositeKey(consumer, eventId);

    if (this.seen.has(key)) {
      return false;
    }

    this.seen.add(key);

    return true;
  }

  async release(consumer: string, eventId: string): Promise<void> {
    this.seen.delete(compositeKey(consumer, eventId));
  }
}
