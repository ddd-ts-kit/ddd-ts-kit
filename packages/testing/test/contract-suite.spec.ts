import { describe, expect, it } from 'vitest';
import { ContractSuite, type ContractRunner } from '../src/contracts';
import { CollectingRunner } from './support/collecting-runner';

/** A suite that reads its subject while it declares its tests, before any of them runs. */
class ReadingTooEarly extends ContractSuite<string> {
  protected tests(): void {
    this.it(`reads ${this.subject}`, async () => undefined);
  }
}

/** A suite whose one case waits for what it needs. */
class Waiting extends ContractSuite<string> {
  protected tests(): void {
    this.todo('waits for what it needs');
  }
}

/** A suite with a condition that holds and one that does not. */
class Conditions extends ContractSuite<string> {
  protected tests(): void {
    this.it('holds', async () => {
      this.holds(this.subject === 'a subject', 'the subject is not the one created');
    });

    this.it('does not hold', async () => {
      this.holds(this.subject === 'another', `the adapter answered ${this.subject}, not another`);
    });
  }
}

/** A subject that says how many times it was closed. */
class Connection {
  closed = 0;

  close(): void {
    this.closed += 1;
  }
}

/** A suite with two tests that use their subject and close nothing themselves. */
class Using<Subject> extends ContractSuite<Subject> {
  protected tests(): void {
    this.it('uses it once', async () => undefined);
    this.it('uses it twice', async () => undefined);
  }
}

describe('ContractSuite', () => {
  it('has a subject while a test runs, and none outside', () => {
    expect(() => new ReadingTooEarly(new CollectingRunner(), () => 'a subject').describe('too early')).toThrow(
      'The subject of a contract suite only exists while a test runs',
    );
  });

  it('declares a pending case as a todo of the runner, or as a placeholder that passes where the runner has none', async () => {
    const withTodo = new CollectingRunner();

    new Waiting(withTodo, () => 'a subject').describe('with a todo');

    expect(withTodo.pending).toEqual(['waits for what it needs']);
    expect(await withTodo.run()).toEqual({ failed: [], passed: [], messages: [] });

    const collecting = new CollectingRunner();

    const withoutTodo: ContractRunner = {
      describe: (name, suite) => collecting.describe(name, suite),
      it: (name, test) => collecting.it(name, test),
      beforeEach: (setup) => collecting.beforeEach(setup),
      expect: collecting.expect,
    };

    new Waiting(withoutTodo, () => 'a subject').describe('without a todo');

    expect(collecting.pending).toEqual([]);
    expect(await collecting.run()).toEqual({ failed: [], passed: ['waits for what it needs'], messages: [] });
  });

  it('fails a condition that does not hold with the sentence that says what the adapter did', async () => {
    const collecting = new CollectingRunner();

    new Conditions(collecting, () => 'a subject').describe('conditions');

    expect(await collecting.run()).toEqual({
      failed: ['does not hold'],
      passed: ['holds'],
      messages: ['the adapter answered a subject, not another'],
    });
  });

  it('closes after each test the subject it created when the subject has a close, and leaves any other alone', async () => {
    const opened: Connection[] = [];
    const collecting = new CollectingRunner();

    new Using(collecting, () => {
      opened.push(new Connection());

      return opened.at(-1);
    }).describe('closable');

    new Using(collecting, () => ({ close: 'not a function' })).describe('not closable');

    expect(await collecting.run()).toEqual({
      failed: [],
      passed: ['uses it once', 'uses it twice', 'uses it once', 'uses it twice'],
      messages: [],
    });

    expect(opened.map(({ closed }) => closed)).toEqual([1, 1]);
  });
});
