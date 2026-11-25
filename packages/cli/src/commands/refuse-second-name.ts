import type { Arguments } from './arguments';
import { ArgumentsError } from './arguments-error';

/**
 * `db:generate` takes one name, after `--name`: a word left over is refused. Ignored, a flag
 * mistyped would generate another migration than the one asked for.
 */
export function refuseSecondName(args: Arguments): void {
  const [extra] = args.positionals;

  if (extra !== undefined) {
    throw new ArgumentsError(
      `"${extra}" is not an argument of db:generate, which takes one name.`,
      'Name the migration in one word, in kebab-case: `npm run db:generate add-invoices`.',
    );
  }
}
