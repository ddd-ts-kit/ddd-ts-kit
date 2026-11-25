import type { EntitySchema, ObjectLiteral } from 'typeorm';
import type { RowStatements, TenantScoped } from '@ddd-ts-kit/kernel';
import { insertIgnoringConflict } from '../sql/insert-ignoring-conflict';
import type { TypeOrmContext } from '../unit-of-work/type-orm-context';

/**
 * The insert and the guarded update of the row of an aggregate, on the manager of the unit of
 * work in progress. Given the tenant of the work, the row is written in it and its update reaches
 * the row of that tenant alone.
 */
export function rowStatementsOn<Columns extends { readonly id: string | number }>(
  context: TypeOrmContext,
  entity: EntitySchema<ObjectLiteral>,
  tenant?: TenantScoped,
): RowStatements<Columns> {
  return {
    insert: (row, stamp) => insertIgnoringConflict(context.manager(), entity, { ...row, ...tenant, ...stamp }),
    update: async (row, stamp, expected) => {
      const guarded = { id: row.id, version: expected, ...tenant };
      const updated = await context.manager().update(entity, guarded, { ...row, ...stamp });

      return updated.affected ?? 0;
    },
  };
}
