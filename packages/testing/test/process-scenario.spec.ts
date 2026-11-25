import { AssertionError } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { Command, type ProcessDecision } from '@ddd-ts-kit/kernel';
import { givenProcess } from '../src';

interface Dunning {
  readonly invoiceId: string;
  readonly stage: 'waiting' | 'paid';
}

class CloseDunning extends Command {
  constructor(readonly invoiceId: string) {
    super();
  }
}

const due = new Date('2026-03-02T12:00:00.000Z');

/** The message of the AssertionError a failing assertion throws. */
const failureOf = (assertion: () => unknown): string => {
  try {
    assertion();
  } catch (error) {
    expect(error).toBeInstanceOf(AssertionError);

    return error instanceof Error ? error.message : '';
  }

  throw new Error('The assertion was expected to fail');
};

const issued = (current: Dunning | undefined): ProcessDecision<Dunning> | undefined =>
  current === undefined
    ? { state: { invoiceId: 'invoice-1', stage: 'waiting' }, timeouts: [{ name: 'reminder', at: due }] }
    : undefined;

const paid = (current: Dunning | undefined): ProcessDecision<Dunning> | undefined =>
  current === undefined
    ? undefined
    : {
        state: { ...current, stage: 'paid' },
        commands: [new CloseDunning(current.invoiceId)],
        cancel: ['reminder'],
        ended: true,
      };

describe('a step of a process, given a state', () => {
  it('asserts the state, the timeouts, the commands, the disarmed timeouts and the end', () => {
    givenProcess<Dunning>(undefined)
      .when(issued)
      .thenState({ invoiceId: 'invoice-1', stage: 'waiting' })
      .thenTimeouts([{ name: 'reminder', at: due }])
      .thenCommands([])
      .thenCancelled([]);

    givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' })
      .when(paid)
      .thenCommands([CloseDunning])
      .thenCommands([{ invoiceId: 'invoice-1' }])
      .thenCancelled(['reminder'])
      .thenEnded();

    givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' }).when(issued).thenIgnored();
  });

  it('says what differs in one sentence, with what was expected and what was decided', () => {
    const outcome = givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' }).when(paid);
    const ignored = givenProcess<Dunning>(undefined).when(paid);

    expect(failureOf(() => outcome.thenState({ invoiceId: 'invoice-1', stage: 'waiting' }))).toBe(
      "Expected the state { invoiceId: 'invoice-1', stage: 'waiting' }, but the step decided { invoiceId: 'invoice-1', stage: 'paid' }.",
    );

    expect(failureOf(() => outcome.thenIgnored())).toContain(
      'Expected the step to ignore what it was given, but it decided { cancel:',
    );

    expect(failureOf(() => ignored.thenEnded())).toBe('Expected a decision, but the step ignored what it was given.');

    expect(failureOf(() => givenProcess<Dunning>(undefined).when(issued).thenEnded())).toBe(
      'Expected the process to end, but it goes on.',
    );
  });

  it('lists the commands expected and decided, and points at what differs, positions from 1', () => {
    const outcome = givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' }).when(paid);

    expect(failureOf(() => outcome.thenCommands([{ invoiceId: 'invoice-2' }]))).toBe(
      [
        'The decided commands are not the expected ones.',
        'Expected:',
        "  1. { invoiceId: 'invoice-2' }",
        'Decided:',
        "  1. CloseDunning { invoiceId: 'invoice-1' }",
        'Difference:',
        "  1. command 1.invoiceId: expected 'invoice-2', decided 'invoice-1'",
      ].join('\n'),
    );

    expect(failureOf(() => outcome.thenCommands([Command, CloseDunning]))).toContain(
      '  1. expected 2 commands, decided 1 command',
    );

    expect(failureOf(() => outcome.thenCommands([class Other extends Command {}]))).toContain(
      '  1. command 1: expected an instance of Other, decided CloseDunning',
    );
  });

  it('lists the timeouts expected and decided, armed or disarmed', () => {
    const outcome = givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' }).when(paid);

    expect(failureOf(() => outcome.thenTimeouts([{ name: 'reminder', at: due }]))).toBe(
      [
        'The armed timeouts are not the expected ones.',
        'Expected:',
        "  1. { at: 2026-03-02T12:00:00.000Z, name: 'reminder' }",
        'Decided:',
        '  (none)',
      ].join('\n'),
    );

    expect(failureOf(() => outcome.thenCancelled([]))).toBe(
      ['The disarmed timeouts are not the expected ones.', 'Expected:', '  (none)', 'Decided:', '  1. reminder'].join(
        '\n',
      ),
    );
  });

  it('refuses a command matcher that names no property, which any command would match', () => {
    const outcome = givenProcess<Dunning>({ invoiceId: 'invoice-1', stage: 'waiting' }).when(paid);

    expect(() => outcome.thenCommands([{}])).toThrow(
      new TypeError(
        'A command matcher names at least one property: {} would match any command. Give the class of the command to expect it whatever it carries.',
      ),
    );
  });

  it('refuses a state that the JSON of the store would change', () => {
    const dated = (): ProcessDecision<{ readonly since: Date }> => ({ state: { since: due } });

    expect(() => givenProcess<{ readonly since: Date }>(undefined).when(dated).thenState({ since: due })).toThrow(
      /read back as/,
    );
  });

  it('asserts a step that ends the process without a state to keep', () => {
    const settledAtOnce = (): ProcessDecision<undefined> => ({ state: undefined, ended: true });

    givenProcess<undefined>(undefined).when(settledAtOnce).thenState(undefined).thenEnded();
  });
});
