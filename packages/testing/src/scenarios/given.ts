import { isResolvable } from '../builders/is-resolvable';
import { resolve } from '../builders/resolve';
import type { Resolvable } from '../builders/resolvable';
import type { EventSource } from './event-source';
import { scenario, type Scenario } from './scenario';

/**
 * Starts a scenario from an aggregate (or its builder) in its "given" state. The events
 * recorded while arranging are discarded, so only the events of `when` are asserted.
 *
 * A builder gives each `when` a fresh aggregate. An aggregate already built is given to one
 * `when`: a second one is refused, since it would act on what the first one left.
 */
export function given<A extends EventSource>(aggregate: A | Resolvable<A>): Scenario<A> {
  const arrange = (): A => resolve(aggregate);

  return scenario(isResolvable(aggregate) ? arrange : once(arrange));
}

function once<A>(arrange: () => A): () => A {
  let arranged = false;

  return () => {
    if (arranged) {
      throw new TypeError(
        'given(aggregate) runs one when: this one would act on the aggregate the first one changed. Give its builder, or scenario(() => aggregate), to start each when from a fresh one.',
      );
    }

    arranged = true;

    return arrange();
  };
}
