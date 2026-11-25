import { and, eq, type SQL } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { RowStatements, TenantScoped } from '@ddd-ts-kit/kernel';
import { insertIgnoringConflict } from '../sql/insert-ignoring-conflict';
import type { DrizzleContext } from '../unit-of-work/drizzle-context';
import type { AggregateTable } from './aggregate-table';

/** The tenant a row is written in, and the condition that confines its update to that tenant. */
export interface OwnTenant {
  readonly written: TenantScoped;
  readonly condition: SQL;
}

/** The insert and the guarded update of the row of an aggregate, on the executor of the unit of work in progress. */
export function rowStatementsOn<Columns extends { readonly id: string | number }>(
  database: DrizzleContext<PgQueryResultHKT, Record<string, unknown>>,
  table: AggregateTable,
  tenant?: OwnTenant,
): RowStatements<Columns> {
  return {
    insert: (row, stamp) =>
      insertIgnoringConflict(
        () =>
          database
            .executor()
            .insert(table)
            .values({ ...row, ...tenant?.written, ...stamp }),
        table,
      ),
    update: async (row, stamp, expected) => {
      const written = await database
        .executor()
        .update(table)
        .set({ ...row, ...stamp })
        .where(and(eq(table.id, row.id), eq(table.version, expected), tenant?.condition))
        .returning({ id: table.id });

      return written.length;
    },
  };
}
