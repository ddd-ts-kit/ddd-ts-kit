import path from 'node:path';
import { migrationFiles } from '../../migration/migration-files';
import { previousPrimaryKeys } from '../../migration/previous-primary-keys';
import { primaryKeyOrderFindings } from '../../migration/primary-key-order-findings';
import { drizzleOutFolder } from '../migrations/drizzle-out-folder';
import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

export const persistencePrimaryKeyOrder: Rule = {
  id: 'persistence/primary-key-order',
  description:
    'Under drizzle-kit, no migration adds the new primary key of a table before its old one is dropped, nor drops a column before the primary key that holds it: PostgreSQL refuses the migration when it runs.',
  severity: 'warn',
  doc: {
    why: 'A table has one primary key. When a migration changes it, drizzle-kit may write the statement that adds the new key before the one that drops the old key, or drop a column before the key that holds it; PostgreSQL refuses either, and the migration fails only when it runs, on the database of a colleague or of a deployment. `drizzle-generate` warns when it writes such a migration; this rule keeps reporting it until the migration is fixed, so that a warning that scrolled away is not merged. A dropped constraint is a primary key when the snapshot before the migration records it or its name ends in `_pkey` or `_pk`. Fix the migration while no database has applied it: move the `DROP CONSTRAINT` above, or write the change yourself with `npm run db:generate -- <name> --custom`.',
    bad: `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_issuer_pk" PRIMARY KEY("id","issuer");--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_pkey";   -- too late: the ADD above already failed`,
    good: `ALTER TABLE "invoices" DROP CONSTRAINT "invoices_pkey";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_issuer_pk" PRIMARY KEY("id","issuer");`,
  },
  scope: 'project',
  run(project) {
    if (project.config.stack.orm !== 'drizzle') {
      return [];
    }

    const report = reporter(project, this.id);
    const folder = drizzleOutFolder(project.root);
    const files = migrationFiles(project.root, folder);

    return [...files]
      .filter(([file]) => file.endsWith('.sql') && path.posix.dirname(file) === folder)
      .flatMap(([file, sql]) => toViolations(report, file, keyOrderFindings(files, file, sql)));
  },
};

function keyOrderFindings(files: ReadonlyMap<string, string>, file: string, sql: string): Finding[] {
  return primaryKeyOrderFindings(sql, previousPrimaryKeys(files, file)).map(({ early, message, fix }) => ({
    line: early.line,
    message,
    fix,
  }));
}
