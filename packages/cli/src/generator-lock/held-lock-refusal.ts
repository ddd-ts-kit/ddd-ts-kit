import { CliError } from '../cli-error';
import { LOCK_FOLDER } from '../workspace/kit-folder';
import { holderText } from './holder-text';
import type { LockHolder } from './lock-holder';

/** The refusal of a command that waited for the lock as long as it waits: exit code 2, the other command named. */
export function heldLockRefusal(holder: LockHolder, now: number): CliError {
  return new CliError(
    `Another command holds the lock of this project: ${holderText(holder, now)}. This command waited for it and wrote nothing.`,
    `Run the commands that write the project one after the other: run this command again once that one has ended. A lock taken on this machine is kept while its command runs and taken over once it has ended; one taken on another machine, or whose holder cannot be read, is taken over a minute after it was taken. To take it at once, remove ${LOCK_FOLDER}.`,
  );
}
