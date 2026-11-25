import { loadedAt } from './loaded-at';

/** The two directions a mapper declares between an aggregate and its row: nothing of the version. */
export interface AggregateMapping<A, Row, Columns> {
  /** Rebuilds the aggregate from a row it reads. */
  toDomain(row: Row): A;
  /** Flattens the aggregate into the columns it owns: the version, the tenant and the audit stamps are the adapter's. */
  toRow(aggregate: A): Columns;
}

/**
 * The mapper of an aggregate whose row carries its `version`. It maps the state and never writes
 * a version: `toDomain` answers the aggregate loaded at the version of the row it was given, which
 * the next save expects.
 *
 *     export const InvoiceMapper = aggregateMapper({
 *       toDomain: (row: InvoiceRow) => Invoice.rehydrate(row.id, { total: Money.of(row.total) }),
 *       toRow: (invoice: Invoice): InvoiceColumns => ({ id: invoice.id, total: invoice.total.amount }),
 *     });
 */
export function aggregateMapper<A extends object, Row extends { readonly version: number }, Columns>(
  mapping: AggregateMapping<A, Row, Columns>,
): AggregateMapping<A, Row, Columns> {
  return {
    toDomain: (row) => loadedAt(mapping.toDomain(row), row.version),
    toRow: (aggregate) => mapping.toRow(aggregate),
  };
}
