import type { CircuitState } from './circuit-state';
import type { Refused } from './refused';

/**
 * One state of a circuit, from the transition that entered it to the one that leaves it. What
 * may end it answers the phase the circuit is in afterwards: itself, or the next one.
 */
export interface CircuitPhase {
  readonly state: CircuitState;
  /** The phase a call arriving at this instant meets. */
  at(now: number): CircuitPhase;
  /** Lets one call in and takes its outcome, or refuses it. */
  admit(): Admitted | Refused;
}

/** What a phase does with the outcome of a call it let in: the phase the circuit is in afterwards. */
export interface Admitted {
  answered(): CircuitPhase;
  failed(now: number): CircuitPhase;
}
