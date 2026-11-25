import { COMMANDS } from '../commands';

/** The line every help ends with: what each command accepts besides its own flags. */
export const EVERY_COMMAND =
  'Every command accepts --json (machine-readable output, on one line) and --cwd <dir> (project root).';

/**
 * Every command of the CLI and its flags, as `--help` prints them and docs/guides/commands.md shows
 * them: the usage each command declares, in the order of `COMMANDS`.
 */
export const USAGE = `Usage
${COMMANDS.flatMap(({ spec }) => spec.usage)
  .map((line) => `  ${line}`)
  .join('\n')}

${EVERY_COMMAND}
ddd-ts-kit <command> --help prints the usage and the notes of that command alone, generate <kind> --help one kind;
--json gives either as data.`;
