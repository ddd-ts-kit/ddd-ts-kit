import { codeOf } from '../scenarios/code-of';
import { describeError } from '../scenarios/describe-error';
import { isPromiseLike } from '../scenarios/is-promise-like';
import { mismatch } from '../scenarios/mismatch';
import type { ExpectedFacts } from './expected-facts';
import { factMismatches } from './fact-mismatches';

interface Attempt {
  readonly refused: boolean;
  readonly error?: unknown;
}

/**
 * Asserts a business refusal by its code, and by its facts when given: on an error that was
 * caught, on a `Result`, or on an action, which is run. The class of the error is not looked
 * at. Returns the error. A promise, the one an action returns or one given in its place, is
 * awaited and its answer read as a synchronous one is: the assertion is then a promise to await.
 *
 *     expectRefusal(() => appointment.cancel(at), 'APPOINTMENT_ENDED', { status: 'cancelled' });
 *     expectRefusal(() => Email.create('nope'), 'INVALID_EMAIL');
 *     expectRefusal(Email.create('nope'), 'INVALID_EMAIL'); // a factory that returns a Result
 *     await expectRefusal(() => bus.execute(command), 'SLOT_TAKEN');
 *     await expectRefusal(bus.execute(command), 'SLOT_TAKEN'); // the promise itself
 *
 * The code is any string, or one of the codes the caller names, which the compiler then checks
 * and the editor completes: `expectRefusal<SchedulingCode>(() => appointment.cancel(at), 'APPOINTMENT_ENDED')`.
 */
export function expectRefusal<Code extends string = string>(
  subject: PromiseLike<unknown> | (() => PromiseLike<unknown>),
  code: NoInfer<Code>,
  facts?: ExpectedFacts,
): Promise<unknown>;
export function expectRefusal<Code extends string = string>(
  subject: unknown,
  code: NoInfer<Code>,
  facts?: ExpectedFacts,
): unknown;

export function expectRefusal(subject: unknown, code: string, facts: ExpectedFacts = {}): unknown {
  const attempt = attempted(subject);

  return attempt instanceof Promise
    ? attempt.then((settled) => refusalOf(settled, code, facts))
    : refusalOf(attempt, code, facts);
}

/** What the subject says: an action is run, and a promise, returned or given, is awaited as something that ran. */
function attempted(subject: unknown): Attempt | Promise<Attempt> {
  const ran = isAction(subject);

  try {
    const answer: unknown = ran ? subject() : subject;

    return isPromiseLike(answer)
      ? Promise.resolve(answer).then((value) => outcomeOf(value, { ran: true }), refusedWith)
      : outcomeOf(answer, { ran });
  } catch (error) {
    return refusedWith(error);
  }
}

function refusedWith(error: unknown): Attempt {
  return { refused: true, error };
}

function isAction(subject: unknown): subject is () => unknown {
  return typeof subject === 'function';
}

/** A `Result` says by itself whether it refuses; anything else an action returned is a success. */
function outcomeOf(value: unknown, { ran = false } = {}): Attempt {
  if (typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean') {
    return value.ok || !('error' in value) ? { refused: false } : { refused: true, error: value.error };
  }

  return ran ? { refused: false } : { refused: true, error: value };
}

function refusalOf(attempt: Attempt, code: string, facts: ExpectedFacts): unknown {
  if (!attempt.refused) {
    throw mismatch(`Expected a refusal with code ${code}, but nothing was refused.`, { ...REFUSAL, expected: code });
  }

  const { error } = attempt;
  const actual = codeOf(error);

  if (actual !== code) {
    throw mismatch(`Expected a refusal with code ${code}, but got ${describeError(error)}.`, {
      ...REFUSAL,
      expected: code,
      actual,
    });
  }

  const differences = factMismatches(error, facts);

  if (differences.length > 0) {
    throw mismatch(`The refusal ${code} does not carry the expected facts.`, {
      ...REFUSAL,
      expected: facts,
      actual: error,
      sections: { Difference: differences },
    });
  }

  return error;
}

const REFUSAL = { operator: 'expectRefusal' };
