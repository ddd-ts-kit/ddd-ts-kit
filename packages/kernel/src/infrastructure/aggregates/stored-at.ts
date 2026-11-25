import { AggregateTracking } from '../../domain/aggregate-tracking';
import { notedAsFound } from './noted-as-found';

/**
 * Notes what a save wrote: the aggregate stands at `version`, and its stream, when it has one,
 * holds `appended` more of its recorded events. Inside a unit of work, the aggregate is first noted
 * as it stood: a rollback puts it back.
 */
export function storedAt(aggregate: object, version: number, appended = 0): void {
  const tracking = AggregateTracking.of(aggregate);

  notedAsFound(tracking);
  tracking.version = version;
  tracking.appended += appended;
}
