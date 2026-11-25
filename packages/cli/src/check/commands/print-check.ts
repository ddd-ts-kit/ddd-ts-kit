import type { Io } from '../../commands/io';
import type { CheckResult } from '../engine/check-result';
import { type CheckFormat, formatCheck } from '../engine/format-check';
import { explanationsOf } from '../explain/explanations-of';

/** How a check is printed: its output, and whether the reason of each rule reported follows the violations. */
interface Printing {
  readonly format: CheckFormat;
  readonly explain: boolean;
}

/** Prints what a check found and answers its exit code: 1 while an error is left. */
export function printCheck(io: Io, result: CheckResult, { format, explain }: Printing): number {
  io.out(formatCheck(result, format, explain ? explanationsOf(result.violations) : undefined));

  return result.errorCount > 0 ? 1 : 0;
}
