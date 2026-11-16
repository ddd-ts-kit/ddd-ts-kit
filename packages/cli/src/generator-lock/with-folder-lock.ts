import fs from 'node:fs';
import path from 'node:path';
import type { CliError } from '../cli-error';
import type { DiskWrites } from '../workspace/disk-writes';
import { KIT_FOLDER } from '../workspace/kit-folder';
import { holderOf } from './holder-of';
import { isSameHolder } from './is-same-holder';
import { isStale } from './is-stale';
import type { LockHolder } from './lock-holder';
import type { LockTiming } from './lock-timing';
import { ownLock, type LockPlace, type OwnLock } from './own-lock';
import { removeMadeFolder } from './remove-made-folder';
import { removeStale } from './remove-stale';

/**
 * A lock of the project at `root`: the folder `lock` (relative to the root, in the kit folder),
 * asked by `command` (its line, as another holder's refusal names it). `refusal` is what a command
 * that waited as long as `timing` says is told: who holds it, or nothing when the lock reads as
 * nothing. `disk` writes the holder file, which a spec replaces to make that write fail.
 */
export interface FolderLockRequest {
  readonly root: string;
  readonly lock: string;
  readonly command: string;
  readonly timing: LockTiming;
  readonly refusal: (holder: LockHolder | undefined, now: number) => CliError;
  readonly disk?: Pick<DiskWrites, 'writeFileSync'>;
}

/**
 * Runs `run` while this command holds the lock. The lock is a folder, made in one step on every
 * platform, holding the command line, the pid and the start instant. A lock another command holds
 * is waited for, one left behind (`isStale`) is taken over, and the command is refused once the
 * wait is over. A `.ddd-ts-kit` that is a link, or that this process cannot write, holds no lock:
 * the command runs as it would without.
 */
export function withFolderLock<T>(request: FolderLockRequest, run: () => T): T {
  const { root, lock, command, disk = fs } = request;
  const place = { folder: path.join(root, KIT_FOLDER), lock: path.join(root, lock), command, disk };
  const release = takeLock(place, request);

  try {
    return run();
  } finally {
    release();
  }
}

/** The lock taken, waited for or taken over: what releases it, or the refusal of the request. */
function takeLock(place: LockPlace, request: FolderLockRequest): () => void {
  if (fs.lstatSync(place.folder, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
    return () => undefined;
  }

  const deadline = Date.now() + request.timing.waitMs;
  let taken = ownLock(place);

  while (taken === 'held') {
    waitOrTakeOver(place.lock, request, deadline);
    taken = ownLock(place);
  }

  const owned = taken;

  return owned === 'unlockable' ? () => undefined : () => release(owned);
}

/**
 * One look at the lock another holds: taken over when stale, else waited for until the deadline. A
 * lock that reads as nothing was released since the attempt, or is a link to nothing, which no
 * attempt will ever take: the deadline holds for both.
 */
function waitOrTakeOver(lock: string, { timing, refusal }: FolderLockRequest, deadline: number): void {
  const holder = holderOf(lock);

  if (holder !== undefined && isStale(holder, Date.now(), timing.staleMs)) {
    removeStale(lock, holder);

    return;
  }

  if (Date.now() >= deadline) {
    throw refusal(holder, Date.now());
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timing.pollMs);
}

/** The lock removed, if it is still this command's own (not taken over meanwhile), and the kit folder if the lock made it. */
function release({ folder, lock, startedAt, made }: Exclude<OwnLock, 'held' | 'unlockable'>): void {
  if (isSameHolder(holderOf(lock), { startedAt, pid: process.pid })) {
    fs.rmSync(lock, { recursive: true, force: true });
  }

  removeMadeFolder(folder, made);
}
