import { Arguments, type ArgumentsOf, type FlagOf, type OptionSpecs } from './arguments';
import { holdingTheLock, type Writing } from './holding-the-lock';
import type { Io } from './io';

/**
 * What a command says of itself, once: its name, the options its parser accepts, and what it does
 * with them. The entry, the help and the specs read the declaration; nothing else lists a command.
 */
export interface CommandSpec<O extends OptionSpecs> extends Declaration {
  readonly options: O;
  /**
   * Said by a command that reads the shared files of a project and writes them back: it runs while
   * it holds the lock of the project. `true` when it writes in the project of its working
   * directory whatever its flags, else how it writes.
   */
  readonly takesTheLock?: true | Writing<FlagOf<O>>;
  /**
   * Its options on one command line, when they depend on it: a flag of `generate` is a switch for a
   * kind and a text for another.
   */
  readonly optionsOn?: (argv: readonly string[]) => OptionSpecs;
  /**
   * Said by a command a script of the project ends with (`db:generate`): pnpm forwards the `--` of
   * `pnpm run db:generate fill -- --custom`, after which every word is a positional. It is dropped,
   * so that the flag stays a flag.
   */
  readonly endsAScript?: true;
  /** What it does, its arguments read: it prints through `io` and answers its exit code. */
  run(args: ArgumentsOf<O>, io: Io): number;
}

/** What a command declares of itself, as the entry, the help and the specs read it. */
export interface Declaration {
  /** The name it is run under: `ddd-ts-kit <name>`. */
  readonly name: string;
  /** Its own options; `--json`, `--cwd` and `--help` are those of every command. */
  readonly options: OptionSpecs;
  /**
   * Said by a command whose arguments belong to the tool it runs: `--cwd` alone is read, every
   * other word is passed on, `--help` included (`ddd-ts-kit tsc --help` is the help of the compiler).
   */
  readonly passesArgumentsOn?: true;
}

/** One command of the CLI: its arguments and where it prints, answering its exit code. */
export interface Command {
  (args: readonly string[], io: Io): number;
  /** What it declares of itself; absent from a command not declared yet. */
  readonly spec?: Declaration;
}

/** A command from its declaration: it reads its arguments as declared, then runs, under the lock it says it takes. */
export function defineCommand<const O extends OptionSpecs>(spec: CommandSpec<O>): Command {
  const { name, takesTheLock } = spec;

  const command = (argv: readonly string[], io: Io): number => {
    const args = argumentsOf(spec, argv);
    const run = (): number => spec.run(args, io);

    return takesTheLock === undefined
      ? run()
      : holdingTheLock({ name, args }, takesTheLock === true ? {} : takesTheLock, run);
  };

  return Object.assign(command, { spec });
}

function argumentsOf<O extends OptionSpecs>(spec: CommandSpec<O>, argv: readonly string[]): ArgumentsOf<O> {
  if (spec.passesArgumentsOn === true) {
    return Arguments.passedOn(argv);
  }

  const words = spec.endsAScript === true ? argv.filter((word) => word !== '--') : argv;

  return spec.optionsOn === undefined
    ? Arguments.declared(words, spec.options)
    : Arguments.declared(words, spec.optionsOn(words));
}
