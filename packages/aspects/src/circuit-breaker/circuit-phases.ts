import type { CircuitPhase } from './circuit-phase';

/** The phases a phase may give way to, each entered anew: a phase names its successor, and knows no other. */
export interface CircuitPhases {
  closed(): CircuitPhase;
  open(openedAt: number): CircuitPhase;
  halfOpen(since: number): CircuitPhase;
}
