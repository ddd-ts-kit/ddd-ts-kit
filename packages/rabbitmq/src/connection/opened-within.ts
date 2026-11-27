import { answeredWithin } from './answered-within';

export interface Closable {
  close(): Promise<void>;
}

/**
 * A connection or a channel the broker opened within `ms`, or `BrokerUnavailableError`
 * (`REQUEST_TIMEOUT`). One that opens later is closed when it arrives: nobody would use it.
 */
export function openedWithin<T extends Closable>(ms: number, opening: Promise<T>): Promise<T> {
  return answeredWithin(ms, opening, (late) => late.close());
}
