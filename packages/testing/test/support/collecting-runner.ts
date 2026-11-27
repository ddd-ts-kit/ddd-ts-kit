import { expect } from 'vitest';
import type { ContractRunner } from '../../src/contracts';

interface Group {
  readonly setups: (() => Promise<void>)[];
  readonly teardowns: (() => Promise<void>)[];
  readonly tests: { readonly name: string; readonly test: () => Promise<void> }[];
}

/** A runner that keeps the tests of a contract instead of declaring them, to run them and tell which fail. */
export class CollectingRunner implements ContractRunner {
  readonly expect = expect;

  private readonly groups: Group[] = [];

  describe(_name: string, suite: () => void): void {
    this.groups.push({ setups: [], teardowns: [], tests: [] });
    suite();
  }

  readonly pending = new Array<string>();

  readonly it = Object.assign(
    (name: string, test: () => Promise<void>): void => {
      this.groups.at(-1)?.tests.push({ name, test });
    },
    { todo: (name: string): void => void this.pending.push(name) },
  );

  beforeEach(setup: () => Promise<void>): void {
    this.groups.at(-1)?.setups.push(setup);
  }

  afterEach(teardown: () => Promise<void>): void {
    this.groups.at(-1)?.teardowns.push(teardown);
  }

  /** Runs every test between the setups and the teardowns of its group, and answers the names of those that failed and of those that passed. */
  async run(): Promise<{ failed: string[]; passed: string[]; messages: string[] }> {
    const outcome = { failed: new Array<string>(), passed: new Array<string>(), messages: new Array<string>() };

    for (const { setups, teardowns, tests } of this.groups) {
      for (const { name, test } of tests) {
        for (const setup of setups) {
          await setup();
        }

        await test().then(
          () => outcome.passed.push(name),
          (error: unknown) => {
            outcome.failed.push(name);
            outcome.messages.push(error instanceof Error ? error.message : String(error));
          },
        );

        for (const teardown of teardowns) {
          await teardown();
        }
      }
    }

    return outcome;
  }
}
