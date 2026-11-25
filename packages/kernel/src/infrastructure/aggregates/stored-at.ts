import { AggregateTracking } from '../../domain/aggregate-tracking';

/**
 * Notes what a save wrote: the aggregate stands at `version`, and its stream, when it has one,
 * holds `appended` more of its recorded events.
 */
export function storedAt(aggregate: object, version: number, appended = 0): void {
  const tracking = AggregateTracking.of(aggregate);

  tracking.version = version;
  tracking.appended += appended;
}
