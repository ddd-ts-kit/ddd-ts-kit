import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CliError } from '../cli-error';
import { ArgumentsError } from './arguments-error';
import { findRoot } from './find-root';

/**
 * One option of a command: a switch, or a text. A text may be given several times; it says what
 * it takes as the usage writes it (`<ref>`), or the values it is one of, which the parser holds it to.
 */
export type OptionSpec =
  | { readonly type: 'boolean' }
  | {
      readonly type: 'string';
      readonly multiple?: true;
      readonly value?: string;
      readonly values?: readonly string[];
    };

/** The options of one command, each under the name it has on the command line, without its dashes. */
export type OptionSpecs = Readonly<Record<string, OptionSpec>>;

/** The options of `O` that are not of the shape `Not`: every one, when a command declares its options loosely. */
type OptionsNot<O extends OptionSpecs, Not> = { [K in keyof O & string]: O[K] extends Not ? never : K }[keyof O &
  string];

/** The switches among the options `O`. */
export type FlagOf<O extends OptionSpecs> = OptionsNot<O, { type: 'string' }>;

/** What each option of `O` that names its values may hold. */
type ChoicesOf<O extends OptionSpecs> = {
  [K in keyof O & string as O[K] extends { values: readonly string[] } ? K : never]: O[K] extends {
    values: readonly (infer Value extends string)[];
  }
    ? Value
    : never;
};

/** What the parser held the arguments to: an option that names its values holds one of them. */
interface HeldTo<Choices> {
  text<K extends keyof Choices>(key: K): Choices[K] | undefined;
  /** The output the caller asks for among those `--format` names, `--json` being `--format json`; `otherwise` when it asks for none. */
  format(otherwise: Choices[keyof Choices & 'format']): Choices[keyof Choices & 'format'];
}

/** The arguments of a command that declares the options `O`, before its values are held to those it names. */
type Read<O extends OptionSpecs> = Arguments<
  OptionsNot<O, { type: 'boolean' } | { multiple: true }>,
  FlagOf<O>,
  OptionsNot<O, { type: 'boolean' } | { type: 'string'; multiple?: never }>
>;

/** The arguments of a command that declares the options `O`: each accessor takes the options of its shape alone. */
export type ArgumentsOf<O extends OptionSpecs> = HeldTo<ChoicesOf<O>> & Read<O>;

const COMMON: ParseArgsConfig['options'] = {
  json: { type: 'boolean' },
  cwd: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

/**
 * The arguments of one command, read as its options declare them: the options it reads as one
 * text, as a switch and as several texts. A helper names the options it reads, and takes the
 * arguments of any command that declares them; one that names none takes those of any command.
 */
export class Arguments<in Text extends string = never, in Flag extends string = never, in Many extends string = never> {
  /**
   * What makes the arguments of a command that declares fewer options than a reader reads not
   * reach it, whatever else they are typed with: no value, a type only.
   */
  declare private readonly reader?: (text: Text, flag: Flag, many: Many) => void;

  private constructor(
    /** The words of the command line after the name of the command, as they were written. */
    readonly asWritten: readonly string[],
    private readonly values: Readonly<Record<string, unknown>>,
    readonly positionals: readonly string[],
  ) {}

  /**
   * The arguments a command accepts, read as it declares them: an option it does not declare is
   * refused, and so is a value an option does not name.
   */
  static declared<const O extends OptionSpecs>(args: readonly string[], options: O): ArgumentsOf<O> {
    const declared: Read<O> = new Arguments(args, ...read(args, options, true));

    Arguments.holdToItsValues(declared, options);

    return declared;
  }

  /**
   * Asserts that arguments read with the options of several readers at once hold, for each of the
   * options `O`, a value of the shape it declares: a reader of `O` may take them. The flags of
   * `generate` are read with those of every kind, then handed to the kind as it declares its own.
   */
  static readAs<const O extends OptionSpecs>(
    args: Arguments<string, string, string>,
    options: O,
  ): asserts args is Arguments<string, string, string> & ArgumentsOf<O> {
    const misread = Object.entries(options).find(([name, option]) => !holds(option, args.values[name]));

    if (misread !== undefined) {
      throw new Error(`--${misread[0]} was not read as it is declared.`);
    }
  }

  /**
   * What every command accepts (`--json`, `--cwd`), read from a command line that may hold anything
   * else: what the entry knows of it before its command read it, and once a command refused it.
   */
  static ofEveryCommand(args: readonly string[]): Arguments<never, never, never> {
    return new Arguments(args, ...read(args, {}, false));
  }

  /**
   * The positionals of a command line read with `options`, before the command that reads it is
   * known: a flag none of them declares reads as a switch, and nothing is refused.
   */
  static positionalsOf(args: readonly string[], options: OptionSpecs): readonly string[] {
    return read(args, options, false)[1];
  }

  /**
   * The arguments of a command that passes them on to the tool it runs: `--cwd` alone is the kit's,
   * every other word is a positional, a flag of the tool included.
   */
  static passedOn(args: readonly string[]): Arguments<never, never, never> {
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
   * Whether the command line gives the switch `name`, whatever the command declares: false for one
   * it does not declare, which it refused. For what reads a switch of any command, as the lock does.
   */
  givesSwitch(name: string): boolean {
    return this.values[name] === true;
  }

  /** The output the caller asks for: `--json` is `--format json`; `otherwise` when it asks for none. */
  format(otherwise: string): string {
    return this.json ? 'json' : (this.common('format') ?? otherwise);
  }

  get workingDirectory(): string {
    return path.resolve(this.common('cwd') ?? process.cwd());
  }

  /** The project root: the closest directory, upward from the working directory, holding the config file. */
  get projectRoot(): string {
    return findRoot(this.workingDirectory);
  }

  /**
   * Holds each option that names its values to them, which is what lets the command read one of
   * them without looking again; `--json` beside another format asks for two outputs.
   */
  private static holdToItsValues<O extends OptionSpecs>(read: Read<O>, options: O): asserts read is ArgumentsOf<O> {
    const format = read.common('format');

    if (read.json && format !== undefined && format !== 'json' && valuesOf(options['format']) !== undefined) {
      throw new CliError(
        `--json and --format ${format} ask for two outputs.`,
        'Give one of them: --json is --format json.',
      );
    }

    for (const [name, option] of Object.entries(options)) {
      const values = valuesOf(option);
      const other = values === undefined ? undefined : read.given(name).find((value) => !values.includes(value));

      if (values !== undefined && other !== undefined) {
        throw new CliError(`Unknown value "${other}" for --${name}.`, `Use one of: ${values.join(', ')}.`);
      }
    }
  }

  /** A text every command reads the same way, whatever it declares: `--cwd`, and `--format` beside `--json`. */
  private common(key: 'cwd' | 'format'): string | undefined {
    return this.given(key).at(0);
  }

  /** Every value an option was given, whether it takes one or several. */
  private given(name: string): string[] {
    const value = this.values[name];

    return (Array.isArray(value) ? value : [value]).filter((item) => typeof item === 'string');
  }
}

/** Whether a value is of the shape an option declares: absent, a switch given, or the texts it takes. */
function holds(option: OptionSpec, value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (option.type === 'boolean') {
    return value === true;
  }

  const texts: unknown = option.multiple === true ? value : [value];

  return (
    Array.isArray(texts) &&
    texts.every((text) => typeof text === 'string' && (option.values === undefined || option.values.includes(text)))
  );
}

/** The values an option names, when it does. */
function valuesOf(option: OptionSpec | undefined): readonly string[] | undefined {
  return option?.type === 'string' ? option.values : undefined;
}

/** The values and the positionals of a command line; `strict` refuses an option that is not declared. */
function read(
  args: readonly string[],
  options: OptionSpecs,
  strict: boolean,
): [Readonly<Record<string, unknown>>, readonly string[]] {
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
      strict,
    });

    return [values, positionals];
  } catch (error) {
    throw new ArgumentsError(
      error instanceof Error ? error.message : 'Invalid arguments.',
      'Run `ddd-ts-kit --help` for the accepted options.',
    );
  }
}
