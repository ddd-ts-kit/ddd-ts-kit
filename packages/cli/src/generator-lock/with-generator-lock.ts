import fs from 'node:fs';
import type { DiskWrites } from '../workspace/disk-writes';
import { LOCK_FOLDER } from '../workspace/kit-folder';
import { heldLockRefusal } from './held-lock-refusal';
import type { LockTiming } from './lock-timing';
import { unreadableLockRefusal } from './unreadable-lock-refusal';
import { withFolderLock } from './with-folder-lock';

/**
 * The lock of the project at `root`, asked by `command` (its line, as the refusal of another names
 * it); `disk` writes its holder file, which a spec replaces to make that write fail.
 */
interface LockRequest {
  readonly root: string;
  readonly command: string;
  readonly timing?: LockTiming;
  readonly disk?: Pick<DiskWrites, 'writeFileSync'>;
}

/** About five seconds of waiting, a look every tenth of a second, a lock of another machine taken over after a minute. */
const LOCK_TIMING: LockTiming = { waitMs: 5000, pollMs: 100, staleMs: 60_000 };

/**
 * Runs `run` while this command holds the lock of the project, `.ddd-ts-kit/lock`, so that a command
 * that reads the shared files (the config, the composition root, the code lists and permission sets,
 * the barrels) and writes them back never loses what another wrote in between (`withFolderLock`).
 */
export function withGeneratorLock<T>({ root, command, timing = LOCK_TIMING, disk = fs }: LockRequest, run: () => T): T {
  return withFolderLock(
    {
      root,
      lock: LOCK_FOLDER,
      command,
      timing,
      disk,
      refusal: (holder, now) => (holder === undefined ? unreadableLockRefusal() : heldLockRefusal(holder, now)),
    },
    run,
  );
}
