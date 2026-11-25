import { isDeepStrictEqual } from 'node:util';
import type { ExpectedFacts } from '../refusals/expected-facts';
import { factMismatches } from '../refusals/fact-mismatches';
import { codeOf } from './code-of';
import { describeError } from './describe-error';
import { describeEvent } from './describe-event';
import { describeMatcher } from './describe-matcher';
import type { ErrorClass } from './error-class';
import type { EventMatcher } from './event-matcher';
import { eventMismatches } from './event-mismatches';
import { mismatch } from './mismatch';
import { orderedDifferences } from './ordered-differences';
import type { Outcome } from './outcome';
import type { Recorded } from './recorded';

/** The assertions about an action that already ran: each one throws at once. */
export class ImmediateOutcome<A> implements Outcome<A> {
  // An error nobody looked at must not let another assertion pass by accident: once `thenError`
  // looked at it, the events recorded before the throw and the state are what the action left.
  private errorAsserted = false;

  constructor(private readonly recorded: Recorded<A>) {}

  thenEvents(expected: readonly EventMatcher[]): this {
    this.assertNoUnseenError('events');
    const { events } = this.recorded;
    const differences = orderedDifferences(events, expected, EVENTS);

    if (differences.length > 0) {
      throw mismatch('The recorded events are not the expected ones.', {
        operator: 'thenEvents',
        expected: expected.map(describeMatcher),
        actual: events.map(describeEvent),
        sections: {
          Expected: expected.map(describeMatcher),
          Recorded: events.map(describeEvent),
          Difference: differences,
        },
      });
    }

    return this;
  }

  thenEventNames(expected: readonly string[]): this {
    this.assertNoUnseenError('events');
    const actual = this.recorded.events.map((event) => event.name);

    if (!isDeepStrictEqual(actual, [...expected])) {
      throw mismatch('The recorded event names are not the expected ones.', {
        operator: 'thenEventNames',
        expected,
        actual,
        sections: { Expected: expected, Recorded: actual },
      });
    }

    return this;
  }

  thenNoEvent(): this {
    this.assertNoUnseenError('no event');
    const recorded = this.recorded.events.map(describeEvent);

    if (recorded.length > 0) {
      throw mismatch('Expected no event.', {
        operator: 'thenNoEvent',
        expected: [],
        actual: recorded,
        sections: { Recorded: recorded },
      });
    }

    return this;
  }

  thenError(typeOrCode: ErrorClass | string, detail?: string | ExpectedFacts): this {
    const type = typeof typeOrCode === 'string' ? undefined : typeOrCode;
    const expectedCode = typeof typeOrCode === 'string' ? typeOrCode : codeIn(detail);

    const expected = [type?.name, expectedCode === undefined ? undefined : `code ${expectedCode}`]
      .filter((part) => part !== undefined)
      .join(' with ');

    const error = this.thrownInsteadOf(expected);
    const wrongType = type !== undefined && !(error instanceof type);
    const wrongCode = expectedCode !== undefined && codeOf(error) !== expectedCode;

    if (wrongType || wrongCode) {
      throw mismatch(`Expected the action to fail with ${expected}, but it failed with ${describeError(error)}.`, {
        operator: 'thenError',
        expected,
        actual: describeError(error),
      });
    }

    assertFacts(error, typeof detail === 'object' ? detail : {});
    this.errorAsserted = true;

    return this;
  }

  thenState(inspectState: (aggregate: A) => void): this {
    this.assertNoUnseenError('a state');

    inspectState(this.recorded.aggregate);

    return this;
  }

  private thrownInsteadOf(expected: string): unknown {
    const { thrown, events } = this.recorded;

    if (thrown === undefined) {
      throw mismatch(`Expected the action to fail with ${expected}, but it succeeded.`, {
        operator: 'thenError',
        expected,
        actual: undefined,
        sections: { Recorded: events.map(describeEvent) },
      });
    }

    return thrown.error;
  }

  private assertNoUnseenError(expectation: string): void {
    const { thrown } = this.recorded;

    if (thrown !== undefined && !this.errorAsserted) {
      throw mismatch(`Expected ${expectation}, but the action failed with ${describeError(thrown.error)}.`, {
        operator: 'when',
        expected: undefined,
        actual: thrown.error,
      });
    }
  }
}

const EVENTS = { noun: 'event', verb: 'recorded', mismatches: eventMismatches };

function codeIn(detail: string | ExpectedFacts | undefined): string | undefined {
  return typeof detail === 'string' ? detail : undefined;
}

function assertFacts(error: unknown, expected: ExpectedFacts): void {
  const differences = factMismatches(error, expected);

  if (differences.length > 0) {
    throw mismatch('The error does not carry the expected facts.', {
      operator: 'thenError',
      expected,
      actual: error,
      sections: { Difference: differences },
    });
  }
}
