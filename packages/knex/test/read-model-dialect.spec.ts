import knex from 'knex';
import { describe, expect, it } from 'vitest';
import {
  KnexReadModelTable,
  StatementOutsideUnitOfWorkError,
  createKnexUnitOfWork,
  type KnexContext,
  type KnexReadModelOptions,
} from '../src';

interface NoteRow {
  readonly id: string;
  readonly title: string;
}

const NOTES: KnexReadModelOptions<NoteRow> = { table: 'notes', columns: { id: 'id', title: 'title' } };

// Without a connection knex loads no driver: the dialect is all these instances have.
const sqlite = knex({ client: 'better-sqlite3', useNullAsDefault: true });
const postgres = knex({ client: 'pg' });

describe('the read model of knex on a database that is not PostgreSQL', () => {
  it('is refused by name when it is built', () => {
    expect(() => new KnexReadModelTable(createKnexUnitOfWork(sqlite), NOTES)).toThrow(
      new TypeError('The read model of @ddd-ts-kit/knex runs on PostgreSQL, and this knex speaks sqlite'),
    );

    expect(() => new KnexReadModelTable(createKnexUnitOfWork(postgres), NOTES)).not.toThrow();
  });

  it('is refused at its first statement by a context that has no database outside a unit of work', async () => {
    let inUnitOfWork = false;

    const perTenant: KnexContext = {
      executor: () => {
        if (!inUnitOfWork) {
          throw new StatementOutsideUnitOfWorkError();
        }

        return sqlite;
      },
      inTransaction: () => inUnitOfWork,
    };

    const table = new KnexReadModelTable(perTenant, NOTES);

    inUnitOfWork = true;

    await expect(table.find('n1')).rejects.toThrow('runs on PostgreSQL, and this knex speaks sqlite');
    await expect(table.rebuilding()).rejects.toThrow('runs on PostgreSQL, and this knex speaks sqlite');
  });

  it('lets through any other failure of a context asked for its database', () => {
    const broken: KnexContext = {
      executor: () => {
        throw new Error('no pool');
      },
      inTransaction: () => false,
    };

    expect(() => new KnexReadModelTable(broken, NOTES)).toThrow('no pool');
  });
});
