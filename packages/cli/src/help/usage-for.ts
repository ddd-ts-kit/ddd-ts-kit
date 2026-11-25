import type { CliError } from '../cli-error';
import { ArgumentsError } from '../commands/arguments-error';
import { usageOf } from '../generate/usage-of';
import { kindAsked } from './kind-asked';

/**
 * The usage a refused argument is answered with, unindented: the line of the kind under
 * `generate <kind>`, else the lines of the command that refused it; undefined for any other mistake.
 */
export function usageFor(error: CliError, argv: readonly string[]): string | undefined {
  if (!(error instanceof ArgumentsError)) {
    return undefined;
  }

  const kind = kindAsked(argv);

  return kind === undefined
    ? error.usage?.map((line) => line.trim()).join('\n')
    : `ddd-ts-kit generate ${usageOf(kind)}`;
}
