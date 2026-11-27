import { BrokerUnavailableError } from '../errors/broker-unavailable-error';
import { ignore } from '../ignore';
import { within } from './within';

/**
 * What the broker answered to `request` within `ms`. Rejects with `BrokerUnavailableError`
 * (`REQUEST_TIMEOUT`) when no answer came in time, as on Kafka: a request to a stalled broker fails.
 * An answer that comes later is handed to `late`.
 */
export async function answeredWithin<T>(
  ms: number,
  request: Promise<T>,
  late: (answer: T) => unknown = ignore,
): Promise<T> {
  if (!(await within(ms, request))) {
    void request.then(late).catch(ignore);

    throw new BrokerUnavailableError('REQUEST_TIMEOUT');
  }

  return request;
}
