import type { AggregateTracking } from '../../domain/aggregate-tracking';
import { unitOfWorkScope } from '../domain-events/unit-of-work-scope';
import type { AsFound } from './as-found';

/**
 * Notes, once per unit of work and before a save moves it, how the unit of work in progress found
 * an aggregate. Nothing is noted outside of one: a save made alone has nothing to roll back.
 */
export function notedAsFound(tracking: AggregateTracking): AsFound | undefined {
  const scope = unitOfWorkScope.getStore();

  if (scope?.found === undefined || scope.stage === 'after-commit' || scope.stage === 'closed') {
    return undefined;
  }

  const found = scope.found.get(tracking) ?? { version: tracking.version, appended: tracking.appended, taken: [] };

  scope.found.set(tracking, found);

  return found;
}
