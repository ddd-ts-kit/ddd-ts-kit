import type { DomainError } from '../errors/domain-error';
import { frozenCopy } from '../value-object/frozen-copy';
import { InvalidStateMachineError } from './invalid-state-machine-error';
import type { StateMachineDeclaration } from './state-machine-declaration';
import type { StateMachineDescription } from './state-machine-description';
import type { TransitionDeclaration } from './transition-declaration';
import { TransitionError } from './transition-error';

/**
 * The lifecycle of an aggregate: its states, the transitions between them and what refuses
 * them. The aggregate asks it the next state instead of testing its status by hand:
 *
 *     this.state = { ...this.state, status: appointmentLifecycle.next(this.state.status, 'confirm') };
 *
 * A transition the current state does not allow throws the refusal the declaration builds with
 * a static factory; a guard throws its own. The status field changes through it and nowhere
 * else (`lifecycle/status-through-machine`).
 *
 * It keeps a frozen copy of its declaration: what it checked is what it follows.
 */
export class StateMachine<State extends string, Name extends string, Context = void> {
  private readonly declaration: StateMachineDeclaration<State, Name, Context>;

  constructor(declaration: StateMachineDeclaration<State, Name, Context>) {
    assertConsistent(declaration);
    this.declaration = frozenCopy(declaration);
  }

  /** The state an aggregate is created in. Throws `InvalidStateMachineError` for a state that is not initial: a defect, not a refusal. */
  start(state: State): State {
    if (!this.declaration.initial.includes(state)) {
      throw new InvalidStateMachineError(
        `"${state}" is not an initial state: one of ${this.declaration.initial.join(', ')}.`,
      );
    }

    return state;
  }

  /**
   * The state `transition` leads to from `from`. Throws the refusal of a forbidden transition,
   * or of its guard. `context` is what the guards read; a machine without one takes none.
   * Throws `InvalidStateMachineError` for a name that is not a transition of the machine.
   */
  next(from: State, transition: Name, context: Context): State {
    const refusal = this.refusalOf(from, transition, context);

    if (refusal !== undefined) {
      throw refusal;
    }

    return this.declared(transition).to ?? from;
  }

  /** Whether `transition` would be accepted from `from`, its guard included. */
  can(from: State, transition: Name, context: Context): boolean {
    return this.refusalOf(from, transition, context) === undefined;
  }

  /** The transitions a state allows, guards aside. */
  allowedFrom(state: State): Name[] {
    return this.names().filter((name) => this.declared(name).from.includes(state));
  }

  /** A state no transition leaves. */
  isFinal(state: State): boolean {
    return this.allowedFrom(state).length === 0;
  }

  describe(): StateMachineDescription {
    const { states, initial, transitions } = this.declaration;

    return {
      states,
      initial,
      final: states.filter((state) => this.isFinal(state)),
      arrows: this.names().flatMap((transition) => {
        const { from, to, guard } = transitions[transition];

        return from.map((state) => ({ transition, from: state, to: to ?? state, guarded: guard !== undefined }));
      }),
    };
  }

  private refusalOf(from: State, transition: Name, context: Context): DomainError | undefined {
    const declared = this.declared(transition);

    if (!declared.from.includes(from)) {
      const { refused } = this.declaration;

      return refused === undefined
        ? TransitionError.forbidden(from, transition)
        : refused({ from, transition }, context);
    }

    return declared.guard?.(context);
  }

  private declared(transition: Name): TransitionDeclaration<State, Context> {
    if (!Object.hasOwn(this.declaration.transitions, transition)) {
      throw new InvalidStateMachineError(
        `"${transition}" is not a transition of the machine: one of ${this.names().join(', ')}.`,
      );
    }

    return this.declaration.transitions[transition];
  }

  private names(): Name[] {
    return Object.keys(this.declaration.transitions).filter(
      (name): name is Name => name in this.declaration.transitions,
    );
  }
}

function assertConsistent<State extends string, Name extends string, Context>(
  declaration: StateMachineDeclaration<State, Name, Context>,
): void {
  const known = new Set<string>(declaration.states);
  const named = (state: string) => known.has(state);

  if (known.size !== declaration.states.length || known.size === 0) {
    throw new InvalidStateMachineError('A state machine lists its states once each, and at least one.');
  }

  if (declaration.initial.length === 0 || !declaration.initial.every(named)) {
    throw new InvalidStateMachineError(`Initial states are states of the machine: ${declaration.initial.join(', ')}.`);
  }

  for (const [name, { from, to }] of Object.entries<{ from: readonly string[]; to?: string }>(
    declaration.transitions,
  )) {
    if (from.length === 0 || !from.every(named) || (to !== undefined && !named(to))) {
      throw new InvalidStateMachineError(`Transition "${name}" leaves and reaches states of the machine.`);
    }
  }
}
