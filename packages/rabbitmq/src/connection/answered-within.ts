import { BrokerUnavailableError } from '../errors/broker-unavailable-error';
import { within } from './within';

/**
 * What the broker answered to `request` within `ms`. Rejects with `BrokerUnavailableError`
 * (`REQUEST_TIMEOUT`) when no answer came in time, as on Kafka: a request to a stalled broker fails.
 */
export async function answeredWithin<T>(ms: number, request: Promise<T>): Promise<T> {
  if (!(await within(ms, request))) {
    throw new BrokerUnavailableError('REQUEST_TIMEOUT');
  }

  return request;
}
