import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE } from '../config';
import { withGeneratorLock } from '../generator-lock';
import type { Command } from './command';
import { findRoot } from './find-root';

/** What makes a command say what it would write and write nothing: it reads the shared files as they stand. */
const ONLY_SAYS = ['--dry-run', '--check'];

/** How a command writes, when it is not as most do: in the project upward from its working directory, whatever its flags. */
interface Writing {
  /** `init` writes in its working directory itself, a project or not yet. */
  readonly at?: 'upward' | 'working-directory';
  /** The flag without which the command only reads (`depcruise-config --write`, `acceptance --lock`). */
  readonly onlyWith?: string;
}

/**
 * A command that reads the shared files of a project (the config, the composition root, the code
 * lists and permission sets, the barrels, the generated pages) and writes them back: it runs while
 * it holds the lock of the project, so that two of them never lose what the other wrote. Declared
 * once, where the commands are listed (`COMMANDS`): a command never takes the lock itself. No lock
 * is taken to say what would be written, nor where there is no project yet.
 */
export function takingTheLock(name: string, command: Command, { at = 'upward', onlyWith }: Writing = {}): Command {
  return (argv, io) => {
    const root = writes(argv, onlyWith) ? projectOf(argv, at) : undefined;

    return root === undefined
      ? command(argv, io)
      : withGeneratorLock({ root, command: `ddd-ts-kit ${name} ${argv.join(' ')}` }, () => command(argv, io));
  };
}

function writes(argv: readonly string[], onlyWith: string | undefined): boolean {
  return !argv.some((argument) => ONLY_SAYS.includes(argument)) && (onlyWith === undefined || argv.includes(onlyWith));
}

/** The root of the project the command runs in, read from `--cwd` as the command reads it; undefined when no config is there. */
function projectOf(argv: readonly string[], at: 'upward' | 'working-directory'): string | undefined {
  const start = path.resolve(workingDirectoryOf(argv) ?? process.cwd());
  const root = at === 'upward' ? findRoot(start) : start;

  return fs.existsSync(path.join(root, CONFIG_FILE)) ? root : undefined;
}

function workingDirectoryOf(argv: readonly string[]): string | undefined {
  const inline = argv.find((argument) => argument.startsWith('--cwd='));
  const flag = argv.lastIndexOf('--cwd');

  return inline?.slice('--cwd='.length) ?? (flag === -1 ? undefined : argv[flag + 1]);
}
