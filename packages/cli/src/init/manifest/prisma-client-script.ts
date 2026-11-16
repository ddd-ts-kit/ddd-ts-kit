/** The client and the schema of the tests, derived from the Prisma schema at `schema`: the folder, or the one file of versions before 0.95. */
export function prismaClientScript(schema: string): string {
  return `ddd-ts-kit prisma-client --schema ${schema}`;
}
