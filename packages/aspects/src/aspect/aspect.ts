import type { AspectInfo } from './aspect-info';

/**
 * Cross-cutting behaviour applied from outside: takes an instance, answers a wrapper of the same
 * class with its asynchronous methods advised, and leaves the instance as it was. `instanceof`
 * and `private` members keep working, a method runs with the wrapper as `this`, and the state is
 * the one of the instance. Whoever calls the instance itself is not advised; two aspects around
 * one instance are two wrappers. Applying the same aspect to its own wrapper is a no-op.
 */
export type Aspect = <T extends object>(instance: T, info?: AspectInfo) => T;
