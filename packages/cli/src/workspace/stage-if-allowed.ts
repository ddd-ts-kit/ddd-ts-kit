import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DiskWrites } from './disk-writes';
import { errorCodeOf } from './error-code-of';
import { BLOCKED, realPathOf, type RealPath } from './real-path-of';

/** The errors of a path this process may not write: read-only, denied, or a file or device where a folder goes. */
const PROTECTED = new Set(['EACCES', 'EPERM', 'EROFS', 'EEXIST', 'ENOTDIR', 'EISDIR']);

/** The disk the file is written on, and its real path when the plan already resolved it (`refuseLeaving`). */
export interface WriteOptions {
  readonly disk?: DiskWrites;
  readonly real?: RealPath;
}

/** A file written whole beside its place, under a temporary name: what a plan lands once every file of it is written. */
export interface StagedFile {
  /** Moves the file into place; false when this process may not replace what stands there. */
  land(): boolean;
  /** Removes the temporary file if it is still there, and the folders made for it that hold nothing. */
  discard(): void;
}

/**
 * Writes the content to a temporary file beside the place of the file (`<name>.<random>.tmp`), its
 * folders made first and its mode the one of the file it replaces. A link in its place is written
 * through, to where it points. Undefined when the path is protected here, a file this process may
 * not write included (as a dry run says, `cannotWrite`); any other error is thrown, nothing left.
 */
export function stageIfAllowed(
  absolute: string,
  content: string,
  { disk = fs, real = realPathOf(absolute) }: WriteOptions = {},
): StagedFile | undefined {
  const target = real ?? absolute;

  if (target === BLOCKED || !isWritable(target)) {
    return undefined;
  }

  return protectedAsNothing(() => {
    const made = fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    const discard = (): void => discarded(temporary, target, made);

    try {
      disk.writeFileSync(temporary, content);
      keepModeOf(target, temporary);
    } catch (error) {
      discard();

      throw error;
    }

    return { land: () => protectedAsNothing(() => moveInto(temporary, { target, content, disk })) ?? false, discard };
  });
}

/** What `run` answers, or undefined on the error of a protected path. */
function protectedAsNothing<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    if (PROTECTED.has(errorCodeOf(error) ?? '')) {
      return undefined;
    }

    throw error;
  }
}

/** A file that exists is written over only when this process may write it: a rename would replace a read-only one. */
function isWritable(target: string): boolean {
  if (!fs.existsSync(target)) {
    return true;
  }

  try {
    fs.accessSync(target, fs.constants.W_OK);

    return true;
  } catch {
    return false;
  }
}

/** A file written over keeps its mode, such as the executable bit of a hook script. */
function keepModeOf(target: string, temporary: string): void {
  const earlier = fs.statSync(target, { throwIfNoEntry: false });

  if (earlier?.isFile() === true) {
    fs.chmodSync(temporary, earlier.mode & 0o7777);
  }
}

/** One file on its way: where it lands, what it holds, the disk that writes it. */
interface Writing {
  readonly target: string;
  readonly content: string;
  readonly disk: DiskWrites;
}

/**
 * The rename into place. A file that is a mount point (a config a container binds) cannot be
 * replaced, the rename answering EBUSY: it is written in place, as before the temporary files.
 */
function moveInto(temporary: string, { target, content, disk }: Writing): boolean {
  try {
    disk.renameSync(temporary, target);
  } catch (error) {
    if (errorCodeOf(error) !== 'EBUSY') {
      throw error;
    }

    disk.writeFileSync(target, content);
  }

  return true;
}

/** The temporary file gone, then each folder made for it, from the deepest, as long as it holds nothing. */
function discarded(temporary: string, target: string, made: string | undefined): void {
  fs.rmSync(temporary, { force: true });

  if (made === undefined) {
    return;
  }

  for (let folder = path.dirname(target); folder.length >= made.length; folder = path.dirname(folder)) {
    try {
      fs.rmdirSync(folder);
    } catch {
      return;
    }
  }
}
