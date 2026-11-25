import fs from 'node:fs';
import path from 'node:path';
import { CliError } from '../../cli-error';
import type { Arguments } from '../../commands/arguments';

/** A path that exists nowhere is a slip of the caller; an empty report on it would read as clean. */
export function refuseMissingPaths(args: Arguments): void {
  const missing = args.positionals.filter((entry) => !fs.existsSync(path.resolve(args.workingDirectory, entry)));

  if (missing.length > 0) {
    throw new CliError(
      `No such path: ${missing.join(', ')}.`,
      'Name a file or a folder of the project (`ddd-ts-kit check src`), or leave the path out to check the whole project.',
    );
  }
}
