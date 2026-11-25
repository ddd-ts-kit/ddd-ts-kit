import type { AggregateRoot } from '@ddd-ts-kit/kernel';

/** What a scenario is given: an aggregate, whose recorded events the test kit reads for the spec. */
export type EventSource = Pick<AggregateRoot<string | number>, 'id' | 'version'>;
