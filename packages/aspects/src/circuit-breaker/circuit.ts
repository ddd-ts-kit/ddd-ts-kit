import type { Clock } from '@ddd-ts-kit/kernel';
import { CircuitOpenError } from '../errors/circuit-open-error';
import { isBusinessRefusal } from '../errors/is-business-refusal';
import { safely } from '../observability/safely';
import type { CircuitBreakerOptions } from './circuit-breaker-options';
import type { Admitted, CircuitPhase } from './circuit-phase';
import type { CircuitStateChange } from './circuit-state-change';
import { phasesOf } from './phases-of';
import { Refused } from './refused';

/** What a circuit protects, as its transitions name it. */
export type CircuitSubject = Omit<CircuitStateChange, 'from' | 'to'>;

/** A call let in, with the phase that let it in: the only one its outcome has a say in. */
interface AdmittedCall {
  readonly epoch: CircuitPhase;
  readonly outcome: Admitted;
}

/**
 * One circuit: the phase it is in, and the transitions it reports. What a state does is in its
 * phase (`Closed`, `Open`, `HalfOpen`); the circuit lets a call in, runs it, and hands its outcome
 * to the phase that let it in, unless the circuit left that phase meanwhile.
 */
export class Circuit {
  private phase: CircuitPhase;

  constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly subject: CircuitSubject,
  ) {
    this.phase = phasesOf(options).closed();
  }

  async run(clock: Clock, proceed: () => Promise<unknown>): Promise<unknown> {
    const call = this.admit(clock);

    try {
      const result = await proceed();

      this.conclude(call, (outcome) => outcome.answered());

      return result;
    } catch (error) {
      const failure = (this.options.isFailure ?? isFault)(error);

      this.conclude(call, (outcome) => (failure ? outcome.failed(clock.now().getTime()) : outcome.answered()));

      throw error;
    }
  }

  private admit(clock: Clock): AdmittedCall {
    this.become(this.phase.at(clock.now().getTime()));

    const outcome = this.phase.admit();

    if (outcome instanceof Refused) {
      throw new CircuitOpenError(this.operation(), new Date(outcome.retryAt));
    }

    return { epoch: this.phase, outcome };
  }

  /** The late outcome of a call let in during an earlier phase says nothing of the dependency now. */
  private conclude({ epoch, outcome }: AdmittedCall, verdict: (outcome: Admitted) => CircuitPhase): void {
    if (this.phase === epoch) {
      this.become(verdict(outcome));
    }
  }

  private become(next: CircuitPhase): void {
    if (next === this.phase) {
      return;
    }

    const change = { ...this.subject, from: this.phase.state, to: next.state };

    this.phase = next;

    safely(() => this.options.onStateChange?.(change));
  }

  private operation(): string {
    const { className, method } = this.subject;

    return method === undefined ? className : `${className}.${method}`;
  }
}

function isFault(error: unknown): boolean {
  return !isBusinessRefusal(error);
}
