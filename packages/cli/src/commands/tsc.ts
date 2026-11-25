import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CliError } from '../cli-error';
import { defineCommand } from './command';

/** The native compiler as the project installs it: its package exports no path to its executable, which is found from its manifest. */
const NATIVE_COMPILER = '@typescript/native';

/**
 * `typecheck` and `build` of a generated project: the native TypeScript compiler of the project,
 * found wherever the package manager installed it (in the project, or hoisted to the root of a
 * workspace), with the arguments as given. The `tsc` of `node_modules/.bin` may be the one of
 * `typescript`, which the linter keeps beside it.
 */
export const tscCommand = defineCommand({
  name: 'tsc',
  options: {},
  passesArgumentsOn: true,
  run(args, io) {
    const root = args.workingDirectory;
    const compilerArguments = args.positionals;

    const run = spawnSync(
      process.execPath,
      [compilerOf(root), ...compilerArguments, ...prettyInATerminal(compilerArguments)],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 1024,
      },
    );

    if (run.stdout.trim() !== '') {
      io.out(run.stdout.trimEnd());
    }

    if (run.stderr.trim() !== '') {
      io.err(run.stderr.trimEnd());
    }

    return run.status ?? 1;
  },
});

/** The compiler writes through a pipe here, where it would leave its colours out: asked back when the output is a terminal, unless the arguments say. */
function prettyInATerminal(compilerArguments: readonly string[]): string[] {
  return process.stdout.isTTY && !compilerArguments.some((argument) => argument.startsWith('--pretty'))
    ? ['--pretty']
    : [];
}

function compilerOf(root: string): string {
  try {
    const manifest = createRequire(path.join(root, 'package.json')).resolve(`${NATIVE_COMPILER}/package.json`);

    return path.join(path.dirname(manifest), 'bin', 'tsc');
  } catch {
    throw new CliError(
      `The native TypeScript compiler (${NATIVE_COMPILER}) is not installed for ${root}.`,
      'Install the dependencies of the project (`npm ci`), from the root of the workspace when the project is a package of one.',
    );
  }
}
