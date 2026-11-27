import { AssertionError } from 'node:assert';
import type { Awaitable } from './awaitable';
import type { ContractRunner } from './contract-runner';

type Expectation = ReturnType<ContractRunner['expect']>;

interface Closable {
  close(): Awaitable<unknown>;
}

/**
 * The base of a contract suite: tests about one subject, created anew before each test and
 * closed after it when it has a `close()` and the runner an `afterEach`. A package holding a
 * port extends it to publish the contract of that port. The runner is always called as an
 * object, never through functions taken off it, so a runner that relies on `this` works too.
 */
export abstract class ContractSuite<Subject> {
  private subjectOfTheTest: Subject | undefined;

  constructor(
    private readonly runner: ContractRunner,
    private readonly createSubject: () => Awaitable<Subject>,
  ) {}

  describe(name: string): void {
    this.runner.describe(name, () => {
      this.runner.beforeEach(async () => {
        this.subjectOfTheTest = await this.createSubject();
      });

      this.afterEach(() => this.closeTheSubject());

      this.tests();
    });
  }

  protected abstract tests(): void;

  private async closeTheSubject(): Promise<void> {
    const subject: unknown = this.subjectOfTheTest;

    if (isClosable(subject)) {
      await subject.close();
    }
  }

  protected it(name: string, test: () => Promise<void>): void {
    this.runner.it(name, test);
  }

  /** A case waiting for what it needs: shown as pending where the runner knows `it.todo`. */
  protected todo(name: string): void {
    const { it } = this.runner;

    if (it.todo === undefined) {
      this.runner.it(name, async () => undefined);
    } else {
      it.todo(name);
    }
  }

  protected expect(actual: unknown): Expectation {
    return this.runner.expect(actual);
  }

  /**
   * A condition of the contract that is no value to compare: `otherwise` says what the adapter
   * did instead, which is what its author reads when the case fails.
   */
  protected holds(condition: boolean, otherwise: string): void {
    if (!condition) {
      throw new AssertionError({ message: otherwise, operator: 'holds' });
    }
  }

  protected afterEach(teardown: () => Promise<void>): void {
    this.runner.afterEach?.(teardown);
  }

  protected get subject(): Subject {
    if (this.subjectOfTheTest === undefined) {
      throw new Error('The subject of a contract suite only exists while a test runs');
    }

    return this.subjectOfTheTest;
  }
}

function isClosable(subject: unknown): subject is Closable {
  return typeof subject === 'object' && subject !== null && 'close' in subject && typeof subject.close === 'function';
}
