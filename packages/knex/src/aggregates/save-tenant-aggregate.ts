import { saveAggregateRow, tenantScopeOf, type AggregateSave } from '@ddd-ts-kit/kernel';
import type { TenantTableTarget } from '../tenancy/tenant-table-target';
import type { KnexContext } from '../unit-of-work/knex-context';
import { rowStatementsOn } from './row-statements-on';

/**
 * `saveAggregate` for a table that keeps the rows of every tenant under its tenant column: the
 * row is written in the tenant of the work in progress, and its update reaches the row of that
 * tenant alone, whatever an elevation widens. A row another tenant holds is a `ConcurrencyError`.
 */
export function saveTenantAggregate<Columns extends { readonly id: string | number }>(
  context: KnexContext,
  table: TenantTableTarget,
  save: AggregateSave<Columns>,
): Promise<void> {
  return saveAggregateRow(save, rowStatementsOn(context, table, tenantScopeOf(save.scope)));
}
