import type { Command } from './command';
import type { Io } from './io';

/**
 * Several commands under one name, each chosen by the option that names it (`check --self`,
 * `check --baseline write`): the first mode whose option is on the command line runs, and without
 * any, the command itself. Each reads the options it declares and refuses those of the others.
 */
export function withModes(command: Command, modes: Readonly<Record<string, Command>>): Command {
  const chosen = (argv: readonly string[]): Command =>
    Object.entries(modes).find(([option]) => names(argv, option))?.[1] ?? command;

  const options = Object.fromEntries(
    [command, ...Object.values(modes)].flatMap((mode) => Object.entries(mode.spec.options)),
  );

  return Object.assign((argv: readonly string[], io: Io) => chosen(argv)(argv, io), {
    spec: { ...command.spec, options },
  });
}

/** Whether a command line holds an option, with or without its value. */
function names(argv: readonly string[], option: string): boolean {
  return argv.some((word) => word === `--${option}` || word.startsWith(`--${option}=`));
}
