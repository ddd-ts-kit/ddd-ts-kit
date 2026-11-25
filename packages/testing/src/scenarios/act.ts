import { recordedEventsOf } from '@ddd-ts-kit/kernel';
import type { EventSource } from './event-source';
import { isPromiseLike } from './is-promise-like';
import type { Recorded } from './recorded';

/** Runs the action on the aggregate and reads the events it recorded, the ones of the arrangement left aside. */
export function act<A extends EventSource>(
  aggregate: A,
  action: (aggregate: A) => unknown,
): Recorded<A> | Promise<Recorded<A>> {
  const arranged = recordedEventsOf(aggregate).length;

  const record = (thrown: Recorded<A>['thrown']): Recorded<A> => ({
    aggregate,
    events: recordedEventsOf(aggregate).slice(arranged),
    thrown,
  });

  try {
    const result = action(aggregate);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(
        () => record(undefined),
        (error: unknown) => record({ error }),
      );
    }

    return record(undefined);
  } catch (error) {
    return record({ error });
  }
}
