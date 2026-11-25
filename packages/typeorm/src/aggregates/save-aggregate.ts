import type { EntitySchema, ObjectLiteral } from 'typeorm';
import { saveAggregateRow, type AggregateSave } from '@ddd-ts-kit/kernel';
import type { TypeOrmContext } from '../unit-of-work/type-orm-context';
import { rowStatementsOn } from './row-statements-on';

/**
 * Saves an aggregate in the row of its entity, under optimistic concurrency: an insert the first
 * time, that a taken key makes a `ConcurrencyError` and a value another row holds a
 * `UniqueViolationError`; afterwards an update of the row while it still holds the version the
 * aggregate was loaded at, a `ConcurrencyError` otherwise. The row carries the columns of the
 * mapper, the next version and the audit stamp of the work in progress. The entity keeps the key
 * under `id` and the optimistic concurrency token under `version`.
 *
 *     await saveAggregate(this.database, invoices, { aggregate: saved, row: InvoiceMapper.toRow(saved), scope, clock });
 */
export function saveAggregate<Columns extends { readonly id: string | number }>(
  context: TypeOrmContext,
  entity: EntitySchema<ObjectLiteral>,
  save: AggregateSave<Columns>,
): Promise<void> {
  return saveAggregateRow(save, rowStatementsOn(context, entity));
}
