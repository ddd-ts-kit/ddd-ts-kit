import type { CircuitBreakerOptions } from './circuit-breaker-options';
import type { CircuitPhases } from './circuit-phases';
import { Closed } from './closed';
import { HalfOpen } from './half-open';
import { Open } from './open';

/** The three phases of a circuit under these options: the one place that knows them all. */
export function phasesOf({ failureThreshold, resetAfterMs, halfOpenMax = 1 }: CircuitBreakerOptions): CircuitPhases {
  const phases: CircuitPhases = {
    closed: () => new Closed(phases, failureThreshold),
    open: (openedAt) => new Open(phases, openedAt + resetAfterMs),
    halfOpen: (since) => new HalfOpen(phases, since, halfOpenMax),
  };

  return phases;
}
