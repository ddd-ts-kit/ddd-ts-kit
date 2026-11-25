import type { Clock } from '../../application/ports/clock';
import type { ExecutionScope } from '../../application/ports/execution-scope';

/**
 * One save of an aggregate in the row of its table, as its repository adapter hands it to the
 * `saveAggregate` of its ORM package: the aggregate, the columns its mapper gave, and who writes
 * when. The version, the audit stamps and the tenant of the row are the adapter's, never the mapper's.
 */
export interface AggregateSave<Columns extends { readonly id: string | number }> {
  /** An aggregate of the kit: its version is what the row must still hold, and moves once the row is written. */
  readonly aggregate: { readonly id: string | number; readonly version: number };
  /** `Mapper.toRow(aggregate)`. */
  readonly row: Columns;
  /** The work in progress: its actor stamps the row. */
  readonly scope: ExecutionScope;
  readonly clock: Clock;
}
