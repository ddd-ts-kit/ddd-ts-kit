import { AggregateTracking } from '../../domain/aggregate-tracking';

/**
 * Says at which version an aggregate was loaded: what a repository adapter calls on the aggregate
 * its mapper rebuilt, with the version of the row it read. The next save expects that version.
 *
 *     return row === undefined ? undefined : loadedAt(InvoiceMapper.toDomain(row), row.version);
 */
export function loadedAt<A extends object>(aggregate: A, version: number): A {
  AggregateTracking.of(aggregate).version = version;

  return aggregate;
}
