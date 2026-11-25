import { takeRecordedEvents } from '@ddd-ts-kit/kernel';
import type { EventSource } from './event-source';

/**
 * The aggregate with nothing left to announce, as a repository hands it: what a builder answers
 * once it arranged a state through intentions, so that a spec reads the events of its own act.
 * An event-sourced aggregate is built from its history instead (`givenEvents`): the events dropped
 * here would never reach its stream.
 */
export function withoutRecordedEvents<A extends EventSource>(aggregate: A): A {
  takeRecordedEvents(aggregate);

  return aggregate;
}
