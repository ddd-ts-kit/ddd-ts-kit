import type { Actor } from '../../application/actor/actor';
import { executionContext } from '../../application/execution/execution-context';
import { withActor } from '../../application/execution/with-actor';
import type { ActorContext } from '../../application/ports/actor-context';
import type { ExecutionScope } from '../../application/ports/execution-scope';
import type { IdGenerator } from '../../application/ports/id-generator';
import { requiredActor } from './required-actor';

/**
 * The `ActorContext` of an application that has an execution scope: one source of truth, so
 * the two cannot disagree. The current actor is the actor of the current execution context;
 * `run(actor, work)` runs the work in the current context seen as that actor, or opens a
 * context of origin `internal` when there is none.
 */
export class ScopedActorContext implements ActorContext {
  constructor(
    private readonly scope: ExecutionScope,
    private readonly correlationIds: IdGenerator,
  ) {}

  current(): Actor | undefined {
    return this.scope.current()?.actor;
  }

  require(): Actor {
    return requiredActor(this.current());
  }

  run<T>(actor: Actor, work: () => T): T {
    const current = this.scope.current();

    const context =
      current === undefined
        ? executionContext({ correlationId: this.correlationIds.next(), actor, origin: 'internal' })
        : withActor(current, actor);

    return this.scope.run(context, work);
  }
}
