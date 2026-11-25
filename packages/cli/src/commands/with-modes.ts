import { ArgumentsError } from './arguments-error';
import type { Command } from './command';
import type { Io } from './io';

/**
 * Several commands under one name, each chosen by the option that names it (`check --self`,
 * `check --baseline write`): the first mode whose option is on the command line runs, and without
 * any, the command itself. Each reads the options it declares and refuses those of the others. A
 * mode answers an argument it refuses with its own usage; the command itself, and a mode the usage
 * has no line for, with the usage of them all.
 */
export function withModes(command: Command, modes: Readonly<Record<string, Command>>): Command {
  const all = [command, ...Object.values(modes)];
  const options = Object.fromEntries(all.flatMap((mode) => Object.entries(mode.spec.options)));
  const usage = all.flatMap((mode) => mode.spec.usage);

  const run = (argv: readonly string[], io: Io): number => {
    const mode = Object.entries(modes).find(([option]) => names(argv, option))?.[1];

    try {
      return (mode ?? command)(argv, io);
    } catch (error) {
      throw error instanceof ArgumentsError && (mode === undefined || error.usage === undefined)
        ? error.answeredWith(usage)
        : error;
    }
  };

  return Object.assign(run, { spec: { ...command.spec, options, usage } });
}

/** Whether a command line holds an option, with or without its value. */
function names(argv: readonly string[], option: string): boolean {
  return argv.some((word) => word === `--${option}` || word.startsWith(`--${option}=`));
}
