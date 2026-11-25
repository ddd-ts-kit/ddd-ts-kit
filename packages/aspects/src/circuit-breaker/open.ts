import type { CircuitPhase } from './circuit-phase';
import type { CircuitPhases } from './circuit-phases';
import { Refused } from './refused';

/** Refuses every call while the dependency is given time to recover, then gives way to the trial calls. */
export class Open implements CircuitPhase {
  readonly state = 'open';

  constructor(
    private readonly next: CircuitPhases,
    private readonly retryAt: number,
  ) {}

  at(now: number): CircuitPhase {
    return now < this.retryAt ? this : this.next.halfOpen(this.retryAt);
  }

  admit(): Refused {
    return new Refused(this.retryAt);
  }
}
