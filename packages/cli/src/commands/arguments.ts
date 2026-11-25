import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CliError } from '../cli-error';
import { isOneOf } from '../config/is-one-of';
import { ArgumentsError } from './arguments-error';
import { findRoot } from './find-root';

/** One option of a command: a switch, or a text, which may be given several times. */
type OptionSpec =
  | { readonly type: 'boolean'; readonly default?: false }
  | { readonly type: 'string'; readonly multiple?: true };

/** The options of one command, each under the name it has on the command line, without its dashes. */
export type OptionSpecs = Readonly<Record<string, OptionSpec>>;

/** The options of `O` that are not of the shape `Not`: every one, when a command declares its options loosely. */
type OptionsNot<O extends OptionSpecs, Not> = { [K in keyof O & string]: O[K] extends Not ? never : K }[keyof O &
  string];

/** The switches among the options `O`. */
export type FlagOf<O extends OptionSpecs> = OptionsNot<O, { type: 'string' }>;

/** The arguments of a command that declares the options `O`: each accessor takes the options of its shape alone. */
export type ArgumentsOf<O extends OptionSpecs> = Arguments<
  OptionsNot<O, { type: 'boolean' } | { multiple: true }>,
  FlagOf<O>,
  OptionsNot<O, { type: 'boolean' } | { type: 'string'; multiple?: never }>
>;

const COMMON: ParseArgsConfig['options'] = {
  json: { type: 'boolean' },
  cwd: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

/**
 * The arguments of one command, read as its options declare them: the options it reads as one
 * text, as a switch and as several texts. A helper that names none takes those of any command.
 */
export class Arguments<Text extends string = string, Flag extends string = string, Many extends string = string> {
  private constructor(
    /** The words of the command line after the name of the command, as they were written. */
    readonly asWritten: readonly string[],
    private readonly values: Readonly<Record<string, unknown>>,
    readonly positionals: readonly string[],
  ) {}

  /** The arguments a command accepts, read as it declares them: an option it does not declare is refused. */
  static declared<const O extends OptionSpecs>(args: readonly string[], options: O): ArgumentsOf<O> {
    return new Arguments(args, ...read(args, options));
  }

  /** The same for a command not declared yet, which names its options as it reads them. */
  static parse(args: readonly string[], options: OptionSpecs): Arguments {
    return new Arguments(args, ...read(args, options));
  }

  /**
   * The arguments of a command that passes them on to the tool it runs: `--cwd` alone is the kit's,
   * every other word is a positional, a flag of the tool included.
   */
  static passedOn(args: readonly string[]): Arguments {
    const at = args.findIndex((argument) => argument === '--cwd' || argument.startsWith('--cwd='));

    if (at === -1) {
      return new Arguments(args, {}, args);
    }

    const flag = args[at] ?? '';
    const inline = flag.startsWith('--cwd=');
    const cwd = inline ? flag.slice('--cwd='.length) : (args[at + 1] ?? '');

    return new Arguments(
      args,
      { cwd },
      args.filter((_, index) => index !== at && (inline || index !== at + 1)),
    );
  }

  text(key: Text): string | undefined {
    const value = this.values[key];

    return typeof value === 'string' ? value : undefined;
  }

  flag(key: Flag): boolean {
    return this.values[key] === true;
  }

  many(key: Many): string[] {
    const value: unknown = this.values[key];

    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  }

  /** The given keys that were passed, as an object without undefined values. */
  texts<K extends Text>(keys: readonly K[]): { [P in K]?: string } {
    const picked: { [P in K]?: string } = {};

    for (const key of keys) {
      const value = this.text(key);

      if (value !== undefined) {
        picked[key] = value;
      }
    }

    return picked;
  }

  get json(): boolean {
    return this.values['json'] === true;
  }

  /**
   * The output the caller asks for, among those the command prints: `--json` and `--format json`
   * are one thing, and `--json` beside another format asks for two outputs.
   */
  format<Format extends string>(printed: readonly Format[], otherwise: Format): Format {
    const named = this.common('format');

    if (this.json && named !== undefined && named !== 'json') {
      throw new CliError(
        `--json and --format ${named} ask for two outputs.`,
        'Give one of them: --json is --format json.',
      );
    }

    const asked = this.json ? 'json' : (named ?? otherwise);

    if (!isOneOf(printed, asked)) {
      throw new CliError(`Unknown value "${asked}" for --format.`, `Use one of: ${printed.join(', ')}.`);
    }

    return asked;
  }

  get workingDirectory(): string {
    return path.resolve(this.common('cwd') ?? process.cwd());
  }

  /** The project root: the closest directory, upward from the working directory, holding the config file. */
  get projectRoot(): string {
    return findRoot(this.workingDirectory);
  }

  /** A text every command reads the same way, whatever it declares: `--cwd`, and `--format` beside `--json`. */
  private common(key: 'cwd' | 'format'): string | undefined {
    const value = this.values[key];

    return typeof value === 'string' ? value : undefined;
  }
}

/** The values and the positionals of a command line, an option the command does not declare refused. */
function read(args: readonly string[], options: OptionSpecs): [Readonly<Record<string, unknown>>, readonly string[]] {
  const declared: ParseArgsConfig['options'] = Object.fromEntries(
    Object.entries(options).map(([name, option]) => [
      name,
      { type: option.type, multiple: option.type === 'string' && option.multiple === true },
    ]),
  );

  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: { ...COMMON, ...declared },
      allowPositionals: true,
      strict: true,
    });

    return [values, positionals];
  } catch (error) {
    throw new ArgumentsError(
      error instanceof Error ? error.message : 'Invalid arguments.',
      'Run `ddd-ts-kit --help` for the accepted options.',
    );
  }
}
