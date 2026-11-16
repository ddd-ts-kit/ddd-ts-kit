import { LOCK_FOLDER } from '../workspace/kit-folder';
import type { LockHolder } from './lock-holder';

/** The command that holds a lock, as a refusal names it: its line, its pid and how long ago it took the lock. */
export function holderText({ command, pid, startedAt }: LockHolder, now: number, lock = LOCK_FOLDER): string {
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const started = `started ${seconds} second${seconds === 1 ? '' : 's'} ago`;

  return command === undefined
    ? `a command that has not written its name in ${lock} yet (${started})`
    : `\`${command}\` (${pid === undefined ? '' : `pid ${pid}, `}${started})`;
}
