import { saveAggregateRow, tenantScopeOf, type AggregateSave } from '@ddd-ts-kit/kernel';
import { tenantWhere } from '../tenancy/tenant-where';
import type { PrismaAggregateDelegate } from './prisma-aggregate-delegate';
import { rowStatementsOn } from './row-statements-on';

/**
 * `saveAggregate` for a model that keeps the rows of every tenant under `tenantId`: the row is
 * written in the tenant of the work in progress, and its update reaches the row of that tenant
 * alone, whatever an elevation widens. A key the work cannot read, as one another tenant holds,
 * is refused like a value another row holds.
 */
export function saveTenantAggregate<Columns extends { readonly id: string | number }>(
  delegate: PrismaAggregateDelegate,
  save: AggregateSave<Columns>,
): Promise<void> {
  const tenant = { written: tenantScopeOf(save.scope), read: tenantWhere(save.scope) };

  return saveAggregateRow(save, rowStatementsOn(delegate, tenant));
}
