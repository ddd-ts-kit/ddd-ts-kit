import { BrokerUnavailableError } from './broker-unavailable-error';
import { failureCode } from './failure-code';

/** What a failure of the connection reports: why the broker is out of reach, or the code of the error. */
export function connectionFailureCode(error: unknown): string {
  return error instanceof BrokerUnavailableError ? error.reason : failureCode(error);
}
