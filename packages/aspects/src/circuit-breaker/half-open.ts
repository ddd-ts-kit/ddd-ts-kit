import type { Admitted, CircuitPhase } from './circuit-phase';
import type { CircuitPhases } from './circuit-phases';
import { Refused } from './refused';

/** Lets a few trial calls in; the first outcome among them decides: closed again, or open again. */
export class HalfOpen implements CircuitPhase, Admitted {
  readonly state = 'half-open';

  private trials = 0;

  constructor(
    private readonly next: CircuitPhases,
    private readonly since: number,
    private readonly maxTrials: number,
  ) {}

  at(): CircuitPhase {
    return this;
  }

  admit(): Admitted | Refused {
    if (this.trials >= this.maxTrials) {
      return new Refused(this.since);
    }

    this.trials += 1;

    return this;
  }

  answered(): CircuitPhase {
    return this.next.closed();
  }

  failed(now: number): CircuitPhase {
    return this.next.open(now);
  }
}
