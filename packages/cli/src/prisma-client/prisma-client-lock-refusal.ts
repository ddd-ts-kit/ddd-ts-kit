import { CliError } from '../cli-error';
import { holderText, type LockHolder } from '../generator-lock';
import { PRISMA_CLIENT_LOCK } from './prisma-client-paths';

/** The refusal of a run that waited as long as it waits for another one: the other run named, or the lock that reads as nothing. */
export function prismaClientLockRefusal(holder: LockHolder | undefined, now: number): CliError {
  const held =
    holder === undefined
      ? `${PRISMA_CLIENT_LOCK} stands there and cannot be read, a link to nothing for one`
      : `Another run generates the Prisma client of this project: ${holderText(holder, now, PRISMA_CLIENT_LOCK)}`;

  return new CliError(
    `${held}. This command waited for it and generated nothing.`,
    `Run it again once that one has ended. A lock taken on this machine is kept while its command runs and taken over once it has ended; one taken on another machine, or whose holder cannot be read, is taken over ten minutes after it was taken. To take it at once, remove ${PRISMA_CLIENT_LOCK}.`,
  );
}
