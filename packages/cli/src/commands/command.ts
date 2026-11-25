import { Arguments, type ArgumentsOf, type FlagOf, type OptionSpecs } from './arguments';
import { ArgumentsError } from './arguments-error';
import { holdingTheLock, type Writing } from './holding-the-lock';
import type { Io } from './io';
import { usageLine } from './usage-line';

/**
 * What a command says of itself, once: its name, what it takes, and what it does with it. The
 * entry, the help, the reference of the commands and the specs read the declaration; nothing else
 * lists what a command accepts.
 */
export interface CommandSpec<O extends OptionSpecs> {
  /** The name it is run under: `ddd-ts-kit <name>`. */
  readonly name: string;
  /** The other name it answers to: `g` for `generate`. */
  readonly alias?: string;
  /** Its positional arguments, as the usage writes them: `<context>`, `[paths...]`. */
  readonly positionals?: string;
  /** Said by a command that is one mode of another (`check --baseline`): what chooses it, and why it stands alone. */
  readonly mode?: Mode<keyof O & string>;
  /** Its own options; `--json`, `--cwd` and `--help` are those of every command. */
  readonly options: O;
  /**
   * Its usage, written by hand when the options do not say it: forms that exclude each other, an
   * option it requires, a line too long for one. Each line starts with `ddd-ts-kit`, and a line
   * that continues the one above with spaces. Left out, the usage is written from the options.
   */
  readonly usage?: readonly string[];
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

/** What makes a command one mode of another, under the name of that other. */
interface Mode<Option extends string = string> {
  /** The option of the mode that chooses it: `check --baseline write` is the mode `baseline` of `check`. */
  readonly chosenBy: Option;
  /**
   * Why it takes no option of the other modes, as the words that end the refusal of one: "check
   * --baseline does not take --rule: it judges every rule on every file."
   */
  readonly because: string;
}

/** What a command declares of itself, as the entry, the help and the specs read it. */
export interface Declaration {
  readonly name: string;
  readonly alias: string | undefined;
  readonly mode: Mode | undefined;
  /** The command itself and its modes, each as it declares itself, when it has modes; none otherwise. */
  readonly modes: readonly Declaration[];
  readonly options: OptionSpecs;
  /** Its lines of the usage, as the help prints them under `Usage`. */
  readonly usage: readonly string[];
  /**
   * Whether its arguments belong to the tool it runs: `--cwd` alone is read, every other word is
   * passed on, `--help` included (`ddd-ts-kit tsc --help` is the help of the compiler).
   */
  readonly passesArgumentsOn: boolean;
}

/** One command of the CLI: its arguments and where it prints, answering its exit code. */
export interface Command {
  (args: readonly string[], io: Io): number;
  /** What it declares of itself. */
  readonly spec: Declaration;
}

/**
 * A command from its declaration: it reads its arguments as declared, then runs, under the lock it
 * says it takes. An argument it refuses is answered with its usage.
 */
export function defineCommand<const O extends OptionSpecs>(spec: CommandSpec<O>): Command {
  const { name, alias, mode, options, takesTheLock } = spec;
  const usage = spec.usage ?? [usageLine(spec)];

  const command = (argv: readonly string[], io: Io): number => {
    try {
      const args = argumentsOf(spec, argv);
      const run = (): number => spec.run(args, io);

      return takesTheLock === undefined
        ? run()
        : holdingTheLock({ name, args }, takesTheLock === true ? {} : takesTheLock, run);
    } catch (error) {
      throw error instanceof ArgumentsError && error.usage === undefined ? error.answeredWith(usage) : error;
    }
  };

  return Object.assign(command, { spec: { name, alias, mode, modes: [], options, usage, passesArgumentsOn: false } });
}

function argumentsOf<O extends OptionSpecs>(spec: CommandSpec<O>, argv: readonly string[]): ArgumentsOf<O> {
  const words = spec.endsAScript === true ? argv.filter((word) => word !== '--') : argv;

  return spec.optionsOn === undefined
    ? Arguments.declared(words, spec.options)
    : Arguments.declared(words, spec.optionsOn(words));
}
