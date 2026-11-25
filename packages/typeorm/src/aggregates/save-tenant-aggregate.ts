import type { EntitySchema, ObjectLiteral } from 'typeorm';
import { saveAggregateRow, tenantScopeOf, type AggregateSave } from '@ddd-ts-kit/kernel';
import type { TypeOrmContext } from '../unit-of-work/type-orm-context';
import { rowStatementsOn } from './row-statements-on';

/**
 * `saveAggregate` for an entity that keeps the rows of every tenant under `tenantId`: the row is
 * written in the tenant of the work in progress, and its update reaches the row of that tenant
 * alone, whatever an elevation widens. A row another tenant holds is a `ConcurrencyError`.
 */
export function saveTenantAggregate<Columns extends { readonly id: string | number }>(
  context: TypeOrmContext,
  entity: EntitySchema<ObjectLiteral>,
  save: AggregateSave<Columns>,
): Promise<void> {
  return saveAggregateRow(save, rowStatementsOn(context, entity, tenantScopeOf(save.scope)));
}
