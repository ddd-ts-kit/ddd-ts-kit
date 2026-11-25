import type { Admitted, CircuitPhase } from './circuit-phase';
import type { CircuitPhases } from './circuit-phases';

/** Lets every call in and counts the consecutive failures: at the threshold, the circuit opens. */
export class Closed implements CircuitPhase, Admitted {
  readonly state = 'closed';

  private failures = 0;

  constructor(
    private readonly next: CircuitPhases,
    private readonly failureThreshold: number,
  ) {}

  at(): CircuitPhase {
    return this;
  }

  admit(): Admitted {
    return this;
  }

  answered(): CircuitPhase {
    this.failures = 0;

    return this;
  }

  failed(now: number): CircuitPhase {
    this.failures += 1;

    return this.failures < this.failureThreshold ? this : this.next.open(now);
  }
}
