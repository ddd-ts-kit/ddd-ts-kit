import type { RowStatements, TenantScoped } from '@ddd-ts-kit/kernel';
import { rowsCreated } from '../repository/rows-created';
import type { PrismaAggregateDelegate } from './prisma-aggregate-delegate';

/** The tenant a row is written in and updated in, and the condition under which the work reads the table. */
export interface OwnTenant {
  readonly written: TenantScoped;
  readonly read: object;
}

/**
 * The insert and the guarded update of the row of an aggregate, on the model of the client of the
 * unit of work in progress. `skipDuplicates` skips a row that takes any unique value: `rowsCreated`
 * tells a taken key from another value.
 */
export function rowStatementsOn<Columns extends { readonly id: string | number }>(
  delegate: PrismaAggregateDelegate,
  tenant?: OwnTenant,
): RowStatements<Columns> {
  return {
    insert: async (row, stamp) => {
      const created = await delegate.createMany({
        data: [{ ...row, ...tenant?.written, ...stamp }],
        skipDuplicates: true,
      });

      const holders = async (): Promise<number> => delegate.count({ where: { id: row.id, ...tenant?.read } });

      return (await rowsCreated(created, { id: row.id, holders })) === 1;
    },
    update: async (row, stamp, expected) => {
      const updated = await delegate.updateMany({
        where: { id: row.id, version: expected, ...tenant?.written },
        data: { ...row, ...stamp },
      });

      return updated.count;
    },
  };
}
