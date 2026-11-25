import type { Actor } from '../actor/actor';
import type { ExecutionContext } from './execution-context';

/**
 * The same unit of work seen as another actor. The session and the elevation go: they were the
 * previous actor's. The tenant follows the new actor when it has one.
 */
export function withActor(context: ExecutionContext, actor: Actor): ExecutionContext {
  if (context.actor === actor) {
    return context;
  }

  const { session: _session, elevation: _elevation, tenantId: _tenantId, ...rest } = context;
  const tenantId = actor.tenantId ?? context.tenantId;

  return Object.freeze({ ...rest, actor, ...(tenantId === undefined ? {} : { tenantId }) });
}
