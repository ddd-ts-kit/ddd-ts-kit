import { COMMANDS } from './commands';
import { Arguments } from './commands/arguments';
import type { Command } from './commands/command';
import { inProjectDialect } from './package-manager/in-project-dialect';
import type { Io } from './commands/io';
import { CliError } from './cli-error';
import { helpFor } from './help/help-for';
import { usageFor } from './help/usage-for';
import { ISSUES_URL } from './issues-url';
import { refuseWindowsShell } from './refuse-windows-shell';
import { VERSION } from './version';
import { stdoutJson } from './json/stdout-json';

/** The exit code of a fault of the kit itself, apart from `1` (violations) and `2` (a mistake of the caller). */
const INTERNAL_ERROR = 4;

const processIo: Io = {
  out: (text) => void process.stdout.write(`${text}\n`),
  err: (text) => void process.stderr.write(`${text}\n`),
};

/** What the entry reads of its environment: a spec passes `win32` to see what Windows outside WSL 2 gets. */
export interface RunOptions {
  readonly platform?: NodeJS.Platform;
}

export function run(asked: readonly string[], io: Io = processIo, options?: RunOptions): number {
  const argv = canonical(asked);
  const line = Arguments.ofEveryCommand(argv);
  const [command] = argv;

  try {
    if (command === '--version' || command === '-v') {
      io.out(VERSION);

      return 0;
    }

    if (asksForHelp(asked, argv)) {
      io.out(helpFor(argv, line.json));

      return 0;
    }

    return dispatch(argv, io, options);
  } catch (error) {
    if (!(error instanceof CliError)) {
      return internalError(line, error, io);
    }

    return refused(error, line, io);
  }
}

/**
 * No command, `help`, or `--help` anywhere but in the arguments of a command that passes them on:
 * `ddd-ts-kit tsc --help` is the help of the compiler, `ddd-ts-kit help tsc` the one of the kit.
 */
function asksForHelp(asked: readonly string[], argv: readonly string[]): boolean {
  const [command] = argv;

  if (command === undefined || command === 'help') {
    return true;
  }

  return (
    declared(asked[0] ?? '')?.spec.passesArgumentsOn !== true &&
    argv.some((argument) => argument === '--help' || argument === '-h')
  );
}

/** The command named, once it is known and, on Windows outside WSL 2, allowed to run a script: refused before any work. */
function dispatch([name = '', ...rest]: readonly string[], io: Io, options?: RunOptions): number {
  const command = commandNamed(name);

  refuseWindowsShell(options?.platform ?? process.platform, name, rest);

  return command(rest, io);
}

/**
 * A fault of the kit, not of the caller: said in one line with the version and where to report
 * it, never with the exit code of a violation. Its stack trace, which tells where, follows the
 * line when `DDD_TS_KIT_DEBUG` is set, and is always in the JSON of `--json`.
 */
function internalError(line: Arguments, error: unknown, io: Io): number {
  const message = `internal error of ddd-ts-kit ${VERSION}: ${error instanceof Error ? error.message : String(error)}`;
  const fix = `Please report it at ${ISSUES_URL} with the command: ddd-ts-kit ${line.asWritten.join(' ')}`;
  const stack = error instanceof Error ? error.stack : undefined;

  if (line.json) {
    io.out(stdoutJson({ error: { message, fix, ...(stack === undefined ? {} : { stack }) }, internal: true }));
  } else {
    io.err(`${message}; ${fix.charAt(0).toLowerCase()}${fix.slice(1)}`);

    if (stack !== undefined && (process.env['DDD_TS_KIT_DEBUG'] ?? '') !== '') {
      io.err(stack);
    }
  }

  return INTERNAL_ERROR;
}

/** Prints a mistake of the caller with its fix; a refused argument is answered with the usage of its command or kind. */
function refused(error: CliError, line: Arguments, io: Io): number {
  const fix = usageFor(error, line.asWritten) ?? inProjectDialect(error.fix, line.workingDirectory);

  if (line.json) {
    io.out(stdoutJson({ error: { ...error.facts, message: error.message, fix } }));
  } else {
    io.err(`error: ${error.message}\n  fix: ${fix.split('\n').join('\n       ')}`);
  }

  return error.exitCode;
}

/** The command line with its command under its own name, not its alias; `help <command> ...` read as `<command> ... --help`. */
function canonical(asked: readonly string[]): string[] {
  const [first, ...rest] = asked[0] === 'help' && asked.length > 1 ? [...asked.slice(1), '--help'] : asked;

  return first === undefined ? [] : [declared(first)?.spec.name ?? first, ...rest];
}

function commandNamed(name: string): Command {
  const command = declared(name);

  if (command !== undefined) {
    return command;
  }

  const aliases = COMMANDS.flatMap(({ spec }) => (spec.alias === undefined ? [] : [` ${spec.alias} is ${spec.name}.`]));

  throw new CliError(
    `Unknown command "${name}".`,
    `Use one of: ${COMMANDS.map(({ spec }) => spec.name).join(', ')}.${aliases.join('')}`,
  );
}

/** The command declared under a name or under an alias. */
function declared(name: string): Command | undefined {
  return COMMANDS.find(({ spec }) => spec.name === name || spec.alias === name);
}
