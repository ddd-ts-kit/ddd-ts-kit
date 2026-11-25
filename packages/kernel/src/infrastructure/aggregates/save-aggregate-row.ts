import { optimisticUpdate } from '../../application/persistence/optimistic-update';
import { stampCreation } from '../../application/audit/stamp-creation';
import { stampUpdate } from '../../application/audit/stamp-update';
import type { AuditStamp } from '../../application/audit/audit-stamp';
import type { UpdateStamp } from '../../application/audit/update-stamp';
import type { AggregateSave } from './aggregate-save';

/** The two statements an ORM writes the row of an aggregate with. */
export interface RowStatements<Columns> {
  /** Inserts the row unless its key exists, and says whether it did. */
  insert(row: Columns & { readonly version: number }, stamp: AuditStamp): Promise<boolean>;
  /** Updates the row while it still holds `expected`, and answers how many rows it wrote. */
  update(row: Columns & { readonly version: number }, stamp: UpdateStamp, expected: number): Promise<number>;
}

/**
 * What the `saveAggregate` of each ORM package is made of: the save of an aggregate under
 * optimistic concurrency (`optimisticUpdate`), as an insert the first time and an update guarded by
 * the version afterwards, each with its audit stamp. A project calls the function of its ORM.
 */
export function saveAggregateRow<Columns extends { readonly id: string | number }>(
  { aggregate, row, scope, clock }: AggregateSave<Columns>,
  statements: RowStatements<Columns>,
): Promise<void> {
  return optimisticUpdate(aggregate, async ({ expected, next }) => {
    const versioned = { ...row, version: next };

    return expected === 0
      ? Number(await statements.insert(versioned, stampCreation(scope, clock)))
      : statements.update(versioned, stampUpdate(scope, clock), expected);
  });
}
