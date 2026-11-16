import { PRISMA_SCHEMA_FOLDER } from '../prisma-schema';
import { prismaClientInTurn } from '../prisma-client';
import { Arguments } from './arguments';
import { ArgumentsError } from './arguments-error';
import type { Command } from './command';

/**
 * `db:client` of a Prisma project: the client and the schema of the tests, derived from the Prisma
 * schema (`--schema`, prisma/schema by default), written again unless they are current, one run of
 * the project at a time.
 */
export const prismaClientCommand: Command = (argv, io) => {
  const args = Arguments.parse(argv, { schema: { type: 'string' } });
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
    command: ['ddd-ts-kit prisma-client', ...argv].join(' '),
  });
};
