import { isDeepStrictEqual } from 'node:util';
import type { ProcessDecision, ProcessTimeout } from '@ddd-ts-kit/kernel';
import { describeMatcher } from '../scenarios/describe-matcher';
import { mismatch } from '../scenarios/mismatch';
import { namingAProperty } from '../scenarios/naming-a-property';
import { orderedDifferences } from '../scenarios/ordered-differences';
import { show } from '../scenarios/show';
import { subsetDifferences } from '../scenarios/subset-differences';
import type { CommandMatcher } from './command-matcher';

/**
 * What one step of a process decided, asserted without a store, a queue or a bus. Each assertion
 * answers the outcome, to chain, and fails as those of a scenario do: a sentence, then what was
 * expected, what was decided and where the two differ.
 */
export class ProcessOutcome<State> {
  constructor(private readonly decision: ProcessDecision<State> | undefined) {}

  /** The step ignored what it was given: no state saved, nothing sent. */
  thenIgnored(): this {
    if (this.decision !== undefined) {
      throw mismatch(`Expected the step to ignore what it was given, but it decided ${show(this.decision)}.`, {
        operator: 'thenIgnored',
        expected: undefined,
        actual: this.decision,
      });
    }

    return this;
  }

  /** Also asserts that the state survives the JSON the runner stores it as: a `Date` or a class instance does not. */
  thenState(expected: State): this {
    const state = this.decided('thenState').state;
    const stored: unknown = state === undefined ? undefined : JSON.parse(JSON.stringify(state));

    if (!isDeepStrictEqual(stored, state)) {
      throw mismatch(
        `The state ${show(state)} is stored as JSON and read back as ${show(stored)}: keep it plain JSON data.`,
        { operator: 'thenState', expected: state, actual: stored },
      );
    }

    if (!isDeepStrictEqual(state, expected)) {
      throw mismatch(`Expected the state ${show(expected)}, but the step decided ${show(state)}.`, {
        operator: 'thenState',
        expected,
        actual: state,
      });
    }

    return this;
  }

  /** Exactly these commands, in order: each by its class or the properties that matter. */
  thenCommands(expected: readonly CommandMatcher[]): this {
    const decided = this.decided('thenCommands').commands ?? [];
    const differences = orderedDifferences(decided, expected, COMMANDS);

    if (differences.length > 0) {
      throw mismatch('The decided commands are not the expected ones.', {
        operator: 'thenCommands',
        expected: expected.map(describeMatcher),
        actual: decided.map(show),
        sections: {
          Expected: expected.map(describeMatcher),
          Decided: decided.map(show),
          Difference: differences,
        },
      });
    }

    return this;
  }

  thenTimeouts(expected: readonly ProcessTimeout[]): this {
    const decided = this.decided('thenTimeouts').timeouts ?? [];

    return this.exactly({ operator: 'thenTimeouts', named: 'The armed timeouts', expected, decided });
  }

  /** The names of the timeouts the step disarms. */
  thenCancelled(expected: readonly string[]): this {
    const decided = this.decided('thenCancelled').cancel ?? [];

    return this.exactly({ operator: 'thenCancelled', named: 'The disarmed timeouts', expected, decided });
  }

  thenEnded(): this {
    if (this.decided('thenEnded').ended !== true) {
      throw mismatch('Expected the process to end, but it goes on.', {
        operator: 'thenEnded',
        expected: true,
        actual: false,
      });
    }

    return this;
  }

  private decided(operator: string): ProcessDecision<State> {
    if (this.decision === undefined) {
      throw mismatch('Expected a decision, but the step ignored what it was given.', { operator });
    }

    return this.decision;
  }

  /** Exactly these values, in order, each compared whole. */
  private exactly({ operator, named, expected, decided }: Listed): this {
    if (!isDeepStrictEqual(decided, expected)) {
      throw mismatch(`${named} are not the expected ones.`, {
        operator,
        expected,
        actual: decided,
        sections: { Expected: expected.map(shown), Decided: decided.map(shown) },
      });
    }

    return this;
  }
}

interface Listed {
  readonly operator: string;
  /** What the list holds, as the sentence of the failure opens: `The armed timeouts`. */
  readonly named: string;
  readonly expected: readonly unknown[];
  readonly decided: readonly unknown[];
}

const COMMANDS = { noun: 'command', verb: 'decided', mismatches: commandMismatches };

function commandMismatches(command: unknown, matcher: CommandMatcher, where: string): string[] {
  if (typeof matcher === 'function') {
    return command instanceof matcher
      ? []
      : [`${where}: expected an instance of ${matcher.name}, decided ${show(command)}`];
  }

  return subsetDifferences(command, namingAProperty(matcher, 'command', 'the class'), {
    path: where,
    verb: 'decided',
  });
}

/** A name as it is, as `thenEventNames` lists one; any other value on one line. */
function shown(value: unknown): string {
  return typeof value === 'string' ? value : show(value);
}
