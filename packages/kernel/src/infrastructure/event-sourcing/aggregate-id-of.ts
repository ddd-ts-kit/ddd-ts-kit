import type { StoredEvent } from '../../application/event-sourcing/stored-event';

/** The aggregate a stored event belongs to: the one its metadata names, else its stream. */
export function aggregateIdOf(stored: StoredEvent): string {
  const declared = stored.metadata['aggregateId'];

  return typeof declared === 'string' ? declared : stored.stream;
}
