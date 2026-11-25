import { CliError } from '../cli-error';
import { datasourceList } from './datasource-list';
import { PRISMA_MAIN_SCHEMA } from './prisma-main-schema';

/**
 * The main schema file with this database schema last in its datasource, unless it lists it.
 * Refused when the datasource lists no schemas: the tables of the schema would be declared in a
 * database schema Prisma is not told of.
 */
export function withDatasourceSchema(text: string, schema: string): string {
  const listed = datasourceList(text);

  if (listed === undefined) {
    throw new CliError(
      `${PRISMA_MAIN_SCHEMA}: the datasource lists no \`schemas = [...]\` the generator can add "${schema}" to.`,
      `Write \`schemas = ["${schema}"]\` in the datasource of that file, with the schemas it already uses, then run the command again.`,
    );
  }

  return listed.with(schema);
}
