import type { Knex } from 'knex';
import { dialectOf } from '../sql/dialect-of';
import { StatementOutsideUnitOfWorkError } from '../tenancy/statement-outside-unit-of-work-error';
import type { KnexContext } from '../unit-of-work/knex-context';

/**
 * The context of a read model: its executor is on PostgreSQL, or refused by name. The stamp of a
 * row, the trace of a deleted one, the rebuild and a search that ignores case are written for
 * PostgreSQL alone (`timestamptz`, `boolean`, `to_regclass`, `ilike`): on another database they
 * would answer wrong before they fail. Asked at once, when the read model is built; a context
 * that has no database outside a unit of work (database per tenant) answers at each statement.
 */
export function postgresOnly(context: KnexContext): KnexContext {
  const checked: KnexContext = {
    executor: () => onPostgres(context.executor()),
    inTransaction: () => context.inTransaction(),
  };

  try {
    checked.executor();
  } catch (error) {
    if (!(error instanceof StatementOutsideUnitOfWorkError)) {
      throw error;
    }
  }

  return checked;
}

function onPostgres(executor: Knex): Knex {
  const dialect = dialectOf(executor);

  if (dialect !== 'postgres') {
    throw new TypeError(`The read model of @ddd-ts-kit/knex runs on PostgreSQL, and this knex speaks ${dialect}`);
  }

  return executor;
}
