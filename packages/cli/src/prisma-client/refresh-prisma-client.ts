import fs from 'node:fs';
import path from 'node:path';
import type { Io } from '../commands/io';
import { runOrmTool } from '../migration';
import { clientOutputs } from './client-outputs';
import { prismaClientFingerprint } from './prisma-client-fingerprint';
import { PRISMA_CLIENT_STAMP, TEST_SCHEMA } from './prisma-client-paths';
import { schemaFiles } from './schema-files';

const PRISMA = 'prisma/build/index.js';

/** The project, the Prisma schema its client is derived from (a folder or one file), and where the command prints. */
export interface PrismaClientRequest {
  readonly root: string;
  readonly schema: string;
  readonly io: Io;
}

/**
 * The Prisma client (`prisma generate`, from the same `schema`) and the schema of the tests (`prisma migrate diff` into
 * generated/schema.sql), written again unless they are current: generated from the same schema, the
 * same `prisma.config.ts` and the same Prisma, and still there. The stamp of what they were derived
 * from goes before the first tool runs and comes back once both succeeded, so that a run stopped
 * half way is never taken for current. Answers the exit code of the first tool that fails, else 0.
 */
export function refreshPrismaClient({ root, schema, io }: PrismaClientRequest): number {
  const files = schemaFiles(root, schema);
  const fingerprint = prismaClientFingerprint(root, schema, files);
  const stamp = path.join(root, PRISMA_CLIENT_STAMP);

  if (isCurrent(root, files, fingerprint)) {
    io.out(`The Prisma client and ${TEST_SCHEMA} are current with ${schema}: nothing to generate.\n`);

    return 0;
  }

  fs.rmSync(stamp, { force: true });

  const code = firstFailure(root, [
    ['generate', '--schema', schema],
    ['migrate', 'diff', '--from-empty', '--to-schema', schema, '--script', '-o', TEST_SCHEMA],
  ]);

  if (code === 0) {
    fs.mkdirSync(path.dirname(stamp), { recursive: true });
    fs.writeFileSync(stamp, `${fingerprint}\n`);
  }

  return code;
}

/** Whether the stamp names the same sources and every file the tools write is still there. */
function isCurrent(root: string, files: readonly string[], fingerprint: string): boolean {
  const stamp = path.join(root, PRISMA_CLIENT_STAMP);
  const written = [TEST_SCHEMA, ...clientOutputs(root, files)];

  return (
    fs.existsSync(stamp) &&
    fs.readFileSync(stamp, 'utf8').trim() === fingerprint &&
    written.every((file) => fs.existsSync(path.join(root, file)))
  );
}

/** Runs the CLI of Prisma once per list of arguments, in order, stopping at the first that fails: its exit code, else 0. */
function firstFailure(root: string, runs: readonly (readonly string[])[]): number {
  for (const args of runs) {
    const code = runOrmTool(root, PRISMA, args);

    if (code !== 0) {
      return code;
    }
  }

  return 0;
}
