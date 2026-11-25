import type { AggregateTracking } from '../../domain/aggregate-tracking';
import type { AsFound } from './as-found';

/**
 * Puts the aggregates a unit of work saved back as it found them, since its transaction rolled
 * back: at the version they were loaded at, with the events its saves took, ahead of what they
 * recorded since. The same instances can then be saved again.
 */
export function giveBack(found: Iterable<readonly [AggregateTracking, AsFound]> = []): void {
  for (const [tracking, { version, appended, taken }] of found) {
    tracking.version = version;
    tracking.appended = appended;
    tracking.recorded.unshift(...taken);
  }
}
