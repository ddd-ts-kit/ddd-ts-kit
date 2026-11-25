import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type { DiskWrites } from '../workspace/disk-writes';
import type { LockHolder } from './lock-holder';
import { holderOf } from './holder-of';
import { isSameHolder } from './is-same-holder';

/**
 * Removes a stale lock, if it is still the one judged stale. The lock is moved aside first, in one
 * step, and judged after: of two commands taking it over, one only gets it, and a lock another
 * command took meanwhile is seen where nobody else can remove it, then given back. `disk` moves
 * the lock aside, which a spec replaces to let a second command in at that very instant.
 */
export function removeStale(lock: string, judged: LockHolder, disk: Pick<DiskWrites, 'renameSync'> = fs): void {
  const aside = `${lock}.${randomBytes(6).toString('hex')}.stale`;

  try {
    disk.renameSync(lock, aside);
  } catch {
    // Released, or moved aside by another command first.
    return;
  }

  if (!isSameHolder(holderOf(aside), judged)) {
    giveBack(aside, lock);
  }

  fs.rmSync(aside, { recursive: true, force: true });
}

/** A lock taken since it was judged goes back where its holder left it, unless a third command took the place meanwhile. */
function giveBack(aside: string, lock: string): void {
  try {
    fs.renameSync(aside, lock);
  } catch {
    // The place is taken: the lock moved aside is not put over it.
  }
}
