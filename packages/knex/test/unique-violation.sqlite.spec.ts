import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AggregateRoot, UniqueViolationError } from '@ddd-ts-kit/kernel';
import { optimisticUpdate } from '../src';
import { createSqliteDatabase, type TestSqliteDatabase } from './support/sqlite';

let database: TestSqliteDatabase;

beforeAll(async () => {
  database = await createSqliteDatabase(
    async (knex) => {
      await knex.schema.createTable('members', (table) => {
        table.text('id').primary();
        table.text('email').notNullable().unique();
        table.integer('version').notNullable();
      });
    },
    ['members'],
  );
});

beforeEach(async () => {
  await database.knex('members').del();
  await database.knex('members').insert({ id: 'm-1', email: 'ada@example.com', version: 1 });
});

afterAll(async () => {
  await database.close();
});

class Member extends AggregateRoot {
  constructor(id: string) {
    super(id);
  }
}

/** A first save written as a plain insert, the way a hand-written adapter would on SQLite. */
function firstSave(id: string, email: string): Promise<void> {
  return optimisticUpdate(new Member(id), async ({ next }) => {
    await database.knex('members').insert({ id, email, version: next });

    return 1;
  });
}

describe('a unique violation of the in-process SQLite (better-sqlite3)', () => {
  it('is a UniqueViolationError on a unique column', async () => {
    const failure = await firstSave('m-2', 'ada@example.com').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UniqueViolationError);
    expect(failure).toMatchObject({ code: 'CONFLICT', cause: { code: 'SQLITE_CONSTRAINT_UNIQUE' } });
  });

  it('is a UniqueViolationError on the primary key', async () => {
    const failure = await firstSave('m-1', 'grace@example.com').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UniqueViolationError);
    expect(failure).toMatchObject({ cause: { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' } });
  });

  it('lets another constraint through as the error of the driver', async () => {
    const failure = await optimisticUpdate(new Member('m-3'), async () => {
      await database.knex('members').insert({ id: 'm-3', email: null, version: 1 });

      return 1;
    }).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(UniqueViolationError);
    expect(failure).toMatchObject({ code: 'SQLITE_CONSTRAINT_NOTNULL' });
  });
});
