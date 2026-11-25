import type { Clock } from '../ports/clock';
import type { ExecutionScope } from '../ports/execution-scope';
import type { AuditStamp } from './audit-stamp';
import { stampUpdate } from './stamp-update';

/**
 * For an adapter that holds the stored stamp, a document store rewriting the whole record: the
 * stamp whole, updated by the current actor at the current instant, its creation kept as it is.
 */
export function restamped(stamp: AuditStamp, scope: ExecutionScope, clock: Clock): AuditStamp {
  return { ...stamp, ...stampUpdate(scope, clock) };
}
