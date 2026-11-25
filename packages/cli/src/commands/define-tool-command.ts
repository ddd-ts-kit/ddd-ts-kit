import { Arguments } from './arguments';
import type { Command } from './command';
import type { Io } from './io';

/** What a command that runs a tool says of itself. */
interface ToolCommandSpec {
  readonly name: string;
  /** The arguments of the tool, as the usage writes them: `<arguments of tsc>`. */
  readonly positionals: string;
  /** What it does: `args.positionals` are the words to pass on, `args.workingDirectory` where `--cwd` points. */
  run(args: Arguments<never, never, never>, io: Io): number;
}

/**
 * A command whose arguments belong to the tool it runs: it declares no option, reads `--cwd`
 * alone, and passes every other word on, `--help` and `--json` included.
 */
export function defineToolCommand(spec: ToolCommandSpec): Command {
  return Object.assign((argv: readonly string[], io: Io) => spec.run(Arguments.passedOn(argv), io), {
    spec: {
      name: spec.name,
      alias: undefined,
      options: {},
      usage: [`ddd-ts-kit ${spec.name} ${spec.positionals}`],
      passesArgumentsOn: true,
    },
  });
}
