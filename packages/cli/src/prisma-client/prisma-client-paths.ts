import { KIT_FOLDER } from '../workspace/kit-folder';

/** The schema of the tests, which `prisma migrate diff` writes from the Prisma schema. */
export const TEST_SCHEMA = 'generated/schema.sql';

/** What the client and the schema of the tests were last generated from, written once both are. */
export const PRISMA_CLIENT_STAMP = 'generated/prisma-client.sha256';

/** The lock two runs of `ddd-ts-kit prisma-client` in one project take turns on. */
export const PRISMA_CLIENT_LOCK = `${KIT_FOLDER}/prisma-client`;
