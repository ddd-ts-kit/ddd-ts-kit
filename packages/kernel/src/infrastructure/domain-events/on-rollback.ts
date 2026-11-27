import { unitOfWorkScope } from './unit-of-work-scope';

/**
 * For a store in memory, which no transaction covers: called inside a unit of work, `undo` runs
 * when it rolls back, newest first, once the aggregates are given back and the commit steps
 * undone, before the caller gets the failure; never when it commits. Outside of any unit of
 * work, nothing is kept: a write made alone has nothing to roll back. `undo` puts back what the
 * write found, and leaves what a later write changed: a command running alongside may have
 * committed over it. A `RollbackMap` is the store that does so for each of its keys.
 */
export function onRollback(undo: () => void): void {
  const scope = unitOfWorkScope.getStore();
  const open = scope?.kind === 'unit-of-work' && (scope.stage === 'open' || scope.stage === 'before-commit');

  if (open) {
    scope.rolledBack?.push(undo);
  }
}
