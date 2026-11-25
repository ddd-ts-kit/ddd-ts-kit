import { PRISMA_SCHEMA_FOLDER } from '../prisma-schema';
import { prismaClientInTurn } from '../prisma-client';
import { ArgumentsError } from './arguments-error';
import { defineCommand } from './command';

/**
 * `db:client` of a Prisma project: the client and the schema of the tests, derived from the Prisma
 * schema (`--schema`, prisma/schema by default), written again unless they are current, one run of
 * the project at a time.
 */
export const prismaClientCommand = defineCommand({
  name: 'prisma-client',
  options: { schema: { type: 'string' } },
  run(args, io) {
    const [extra] = args.positionals;

    if (extra !== undefined) {
      throw new ArgumentsError(
        `"${extra}" is not an argument of prisma-client, which takes --schema alone.`,
        `Name the Prisma schema with --schema: \`ddd-ts-kit prisma-client --schema ${PRISMA_SCHEMA_FOLDER}\`.`,
      );
    }

    return prismaClientInTurn({
      root: args.projectRoot,
      schema: args.text('schema') ?? PRISMA_SCHEMA_FOLDER,
      io,
      command: ['ddd-ts-kit prisma-client', ...args.asWritten].join(' '),
    });
  },
});
