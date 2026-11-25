import type { ContractRunner } from './contract-runner';
import type { CreateLogger } from './logger/create-logger';
import { LoggerEntriesSuite } from './logger/logger-entries-suite';
import { LoggerRedactionSuite } from './logger/logger-redaction-suite';
import { LoggerShutdownSuite } from './logger/logger-shutdown-suite';

export interface LoggerContractOptions {
  readonly name: string;
  /** Called before each test, and by the tests that need another level or a scrubbing logger. */
  readonly createLogger: CreateLogger;
  /**
   * Whether the logger hides the field names of `redact`, which `createLogger` then receives, and
   * `CREDENTIAL_KEYS`. Default `false`: `InMemoryLogger` records the fields as they are given.
   */
  readonly redacts?: boolean;
}

/**
 * What every implementation of the kernel `Logger` port guarantees, the in-memory one included:
 * entries, children, the fields of the work in progress and levels in a first suite; errors as
 * fields and the flush in a second. A logger that `redacts` passes a third: the keys it hides.
 */
export function loggerContract(runner: ContractRunner, options: LoggerContractOptions): void {
  new LoggerEntriesSuite(runner, options.createLogger).describe(`${options.name} (logger contract)`);
  new LoggerShutdownSuite(runner, options.createLogger).describe(`${options.name} (logger contract: errors and flush)`);

  if (options.redacts === true) {
    new LoggerRedactionSuite(runner, options.createLogger).describe(`${options.name} (logger contract: redaction)`);
  }
}
