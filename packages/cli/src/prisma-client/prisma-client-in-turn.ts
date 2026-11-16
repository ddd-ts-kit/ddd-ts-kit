import { withFolderLock, type LockTiming } from '../generator-lock';
import { prismaClientLockRefusal } from './prisma-client-lock-refusal';
import { PRISMA_CLIENT_LOCK } from './prisma-client-paths';
import { refreshPrismaClient, type PrismaClientRequest } from './refresh-prisma-client';

/** About ten minutes of waiting for the other run, a look every fifth of a second; a lock of another machine taken over after as long. */
const PRISMA_CLIENT_TIMING: LockTiming = { waitMs: 600_000, pollMs: 200, staleMs: 600_000 };

/** A refresh of the client, asked by `command` (its line, as the refusal of another run names it). */
export interface PrismaClientTurn extends PrismaClientRequest {
  readonly command: string;
  readonly timing?: LockTiming;
}

/**
 * `refreshPrismaClient` while this run holds the lock of the client in the project. Two runs in one
 * project (two test runs started together, a type check beside them) take turns: the second finds
 * the client current and writes nothing, so that no run reads a client another one is rewriting.
 */
export function prismaClientInTurn({ command, timing = PRISMA_CLIENT_TIMING, ...request }: PrismaClientTurn): number {
  return withFolderLock(
    { root: request.root, lock: PRISMA_CLIENT_LOCK, command, timing, refusal: prismaClientLockRefusal },
    () => refreshPrismaClient(request),
  );
}
