import type { Clock } from '../ports/clock';
import type { ExecutionScope } from '../ports/execution-scope';
import type { UpdateStamp } from './update-stamp';

/** For a repository adapter updating a row: the two columns to set, the current actor and instant. The creation is left alone. */
export function stampUpdate(scope: ExecutionScope, clock: Clock): UpdateStamp {
  return { updatedAt: clock.now(), updatedBy: scope.require().actor.id };
}
