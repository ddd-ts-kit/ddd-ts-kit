import { CliError } from '../cli-error';
import type { MigrationTool } from '../orm/migrations/migration-tool';

/**
 * Two migrations of one name read as one in a review, and `verify-merge` knows a migration by
 * what its name says: a name a migration of the folder already carries is refused before the tool
 * of the ORM runs. Names are compared without their number, a dash and an underscore being one
 * (Prisma writes `add_invoices` for `add-invoices`).
 */
export function refuseTakenMigrationName(root: string, tool: MigrationTool, name: string): void {
  const taken = tool.folder(root).migrations.find((migration) => said(migration.name) === said(name));

  if (taken !== undefined) {
    throw new CliError(
      `A migration named ${name} already exists: ${taken.name}.`,
      `Name this one by what it changes this time, a column or a table: \`npm run db:generate ${tool.generatedAs('add-due-date-to-invoices')}\`.`,
    );
  }
}

function said(name: string): string {
  return name
    .replace(/^\d+[_-]/, '')
    .replace(/_/g, '-')
    .toLowerCase();
}
