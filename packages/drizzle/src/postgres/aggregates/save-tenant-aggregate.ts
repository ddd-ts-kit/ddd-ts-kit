import type { PgColumn, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { saveAggregateRow, tenantScopeOf, type AggregateSave } from '@ddd-ts-kit/kernel';
import { ownTenantCondition } from '../tenancy/own-tenant-condition';
import type { DrizzleContext } from '../unit-of-work/drizzle-context';
import type { AggregateTable } from './aggregate-table';
import { rowStatementsOn } from './row-statements-on';

/**
 * `saveAggregate` for a table that keeps the rows of every tenant under `tenantId`: the row is
 * written in the tenant of the work in progress, and its update reaches the row of that tenant
 * alone, whatever an elevation widens. A row another tenant holds is a `ConcurrencyError`.
 */
export function saveTenantAggregate<Columns extends { readonly id: string | number }>(
  database: DrizzleContext<PgQueryResultHKT, Record<string, unknown>>,
  table: AggregateTable & { readonly tenantId: PgColumn },
  save: AggregateSave<Columns>,
): Promise<void> {
  const tenant = { written: tenantScopeOf(save.scope), condition: ownTenantCondition(table.tenantId, save.scope) };

  return saveAggregateRow(save, rowStatementsOn(database, table, tenant));
}
