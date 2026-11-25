import { AggregateTracking } from '../../domain/aggregate-tracking';

/**
 * The aggregates among the arguments of a call, given as such or in arrays, in the order
 * written. Recognised by what they carry, not by their class: a context compiled apart extends
 * its own copy of `AggregateRoot`.
 */
export function recordedAggregates(args: readonly unknown[]): object[] {
  return args.flatMap(listOf).filter((argument) => AggregateTracking.follows(argument));
}

function listOf(argument: unknown): readonly unknown[] {
  return Array.isArray(argument) ? argument : [argument];
}
