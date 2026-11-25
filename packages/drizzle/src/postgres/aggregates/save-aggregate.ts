import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { saveAggregateRow, type AggregateSave } from '@ddd-ts-kit/kernel';
import type { DrizzleContext } from '../unit-of-work/drizzle-context';
import type { AggregateTable } from './aggregate-table';
import { rowStatementsOn } from './row-statements-on';

/**
 * Saves an aggregate in the row of its table, under optimistic concurrency: an insert the first
 * time, that a taken key makes a `ConcurrencyError` and a value another row holds a
 * `UniqueViolationError`; afterwards an update of the row while it still holds the version the
 * aggregate was loaded at, a `ConcurrencyError` otherwise. The row carries the columns of the
 * mapper, the next version and the audit stamp of the work in progress.
 *
 *     await saveAggregate(this.database, invoices, { aggregate: saved, row: InvoiceMapper.toRow(saved), scope, clock });
 */
export function saveAggregate<Columns extends { readonly id: string | number }>(
  database: DrizzleContext<PgQueryResultHKT, Record<string, unknown>>,
  table: AggregateTable,
  save: AggregateSave<Columns>,
): Promise<void> {
  return saveAggregateRow(save, rowStatementsOn(database, table));
}
