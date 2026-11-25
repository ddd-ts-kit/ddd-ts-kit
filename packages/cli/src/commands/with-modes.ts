import { ArgumentsError } from './arguments-error';
import type { Command, Declaration } from './command';
import type { Io } from './io';

/**
 * Several commands under one name: the command itself and its modes, each chosen by the option its
 * declaration names (`check --self`, `check --baseline write`). The mode whose option comes first on
 * the command line runs, and without any, the command itself. Each reads the options it declares:
 * an option another declares is refused in the words of the one asked, with its usage, and an
 * option none of them knows by the parser.
 */
export function withModes(command: Command, modes: readonly Command[]): Command {
  const all = [command, ...modes].map(({ spec }) => spec);
  const options = Object.fromEntries(all.flatMap((spec) => Object.entries(spec.options)));
  const usage = all.flatMap((spec) => spec.usage);

  const run = (argv: readonly string[], io: Io): number => {
    const written = optionsOn(argv);

    const asked = written
      .map((option) => modes.find(({ spec }) => spec.mode?.chosenBy === option))
      .find((mode) => mode !== undefined);

    refuseOptionOfAnother(written, (asked ?? command).spec, all);

    try {
      return (asked ?? command)(argv, io);
    } catch (error) {
      // The command itself answers an option nobody knows with the usage of them all: the mode meant may be any.
      throw error instanceof ArgumentsError && asked === undefined ? error.answeredWith(usage) : error;
    }
  };

  return Object.assign(run, { spec: { ...command.spec, options, usage, modes: all } });
}

/**
 * An option the command asked does not declare and another under its name does has no meaning
 * here: a mode says why, the command itself names the mode the option belongs to.
 */
function refuseOptionOfAnother(written: readonly string[], asked: Declaration, all: readonly Declaration[]): void {
  for (const option of written.filter((word) => !Object.hasOwn(asked.options, word))) {
    const owner = all.find((other) => Object.hasOwn(other.options, option));

    if (owner !== undefined && asked.mode !== undefined) {
      throw new ArgumentsError(
        `${calledAs(asked)} does not take --${option}: ${asked.mode.because}.`,
        `Run it without --${option}.`,
        asked.usage,
      );
    }

    if (owner !== undefined) {
      throw new ArgumentsError(
        `--${option} is an option of ${calledAs(owner)}.`,
        `Give it with ${calledAs(owner)}.`,
        owner.usage,
      );
    }
  }
}

/** How a command line asks for it: `check`, or `check --baseline` for a mode. */
function calledAs({ name, mode }: Declaration): string {
  return mode === undefined ? name : `${name} --${mode.chosenBy}`;
}

/** The options written on a command line, without their dashes nor their value, up to a `--`. */
function optionsOn(argv: readonly string[]): string[] {
  const end = argv.indexOf('--');

  return argv
    .slice(0, end === -1 ? argv.length : end)
    .filter((word) => word.startsWith('--'))
    .map((word) => word.slice(2).split('=')[0] ?? '');
}
