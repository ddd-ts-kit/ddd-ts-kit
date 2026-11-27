import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE } from '../config';
import { withGeneratorLock } from '../generator-lock';
import type { Arguments } from './arguments';

/** What makes a command say what it would write and write nothing: it reads the shared files as they stand. */
const ONLY_SAYS = ['dry-run', 'check'];

/** How a command writes, when it is not as most do: in the project upward from its working directory, whatever its flags. */
export interface Writing<Flag extends string = string> {
  /** `init` writes in its working directory itself, a project or not yet. */
  readonly at?: 'upward' | 'working-directory';
  /** The flag without which the command only reads (`depcruise-config --write`, `acceptance --lock`). */
  readonly onlyWith?: Flag;
}

/** A command as it was asked: under its name, with its arguments. */
interface Asked {
  readonly name: string;
  readonly args: Arguments;
}

/**
 * Runs a command that reads the shared files of a project (the config, the composition root, the
 * code lists and permission sets, the barrels, the generated pages) and writes them back: while it
 * holds the lock of the project, so that two of them never lose what the other wrote. A command
 * says it takes the lock where it declares itself (`takesTheLock`), never by taking it. No lock is
 * taken to say what would be written, nor where there is no project yet.
 */
export function holdingTheLock({ name, args }: Asked, writing: Writing, run: () => number): number {
  const root = writesNow(args, writing.onlyWith) ? projectAt(args, writing.at ?? 'upward') : undefined;

  return root === undefined
    ? run()
    : withGeneratorLock({ root, command: `ddd-ts-kit ${name} ${args.asWritten.join(' ')}` }, run);
}

function writesNow(args: Arguments, onlyWith: string | undefined): boolean {
  return !ONLY_SAYS.some((flag) => args.givesSwitch(flag)) && (onlyWith === undefined || args.givesSwitch(onlyWith));
}

/** The root of the project the command runs in; undefined when no config is there. */
function projectAt(args: Arguments, at: 'upward' | 'working-directory'): string | undefined {
  const root = at === 'upward' ? args.projectRoot : args.workingDirectory;

  return fs.existsSync(path.join(root, CONFIG_FILE)) ? root : undefined;
}
