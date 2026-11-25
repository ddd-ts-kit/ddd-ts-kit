import type { RowStatements, TenantScoped } from '@ddd-ts-kit/kernel';
import { auditRow } from '../columns/audit-row';
import { insertIgnoringConflict } from '../sql/insert-ignoring-conflict';
import { tableIn } from '../tenancy/table-in';
import type { TenantTableTarget } from '../tenancy/tenant-table-target';
import { TENANT_COLUMN } from '../tenancy/where-tenant';
import type { KnexContext } from '../unit-of-work/knex-context';

type Row = Record<string, unknown>;

/**
 * The insert and the guarded update of the row of an aggregate, on the executor of the unit of
 * work in progress. Given the tenant of the work, the row is written in it and its update reaches
 * the row of that tenant alone.
 */
export function rowStatementsOn<Columns extends { readonly id: string | number }>(
  context: KnexContext,
  target: TenantTableTarget,
  tenant?: TenantScoped,
): RowStatements<Columns> {
  const own: Row = tenant === undefined ? {} : { [target.column ?? TENANT_COLUMN]: tenant.tenantId };

  return {
    insert: (row, stamp) =>
      insertIgnoringConflict(context.executor(), tableIn<Row>(context, target), {
        row: { ...row, ...own, ...auditRow(stamp) },
        conflict: 'id',
      }),
    update: (row, stamp, expected) =>
      tableIn<Row>(context, target)
        .where({ id: row.id, version: expected, ...own })
        .update({ ...row, ...auditRow(stamp) }),
  };
}
