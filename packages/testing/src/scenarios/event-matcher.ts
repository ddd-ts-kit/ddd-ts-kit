import type { DomainEvent } from '@ddd-ts-kit/kernel';

type EventClass = abstract new (...args: never[]) => DomainEvent;

/**
 * How an expected event is described: its name, its class, or the properties that matter
 * (a subset: properties left out are not compared, in a nested object and in the objects of a
 * list alike; a list has the expected number of items). It names at least one property.
 */
export type EventMatcher = string | EventClass | { readonly [property: string]: unknown };
