import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AggregateRoot, Clock, DomainError, ExecutionScope, FixedClock, loadedAt } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { repositoryContract } from '@ddd-ts-kit/testing/contracts';
import {
  CONCURRENCY_CONFLICT,
  ConcurrencyError,
  KnexContext,
  createKnexUnitOfWork,
  optimisticUpdate,
  saveAggregate,
  schemaNameOf,
} from '../src';
import { createDatabase, type TestDatabase } from './support/database';
import { Invoice } from './support/billing-core/domain/invoice';
import { InvoiceRepository } from './support/billing-core/domain/repositories/invoice.repository';
import { BILLING } from './support/billing-core/infrastructure/persistence/billing-schema';
import { createInvoicesTable } from './support/billing-core/infrastructure/persistence/create-invoices-table';
import { KnexInvoiceRepository } from './support/billing-core/infrastructure/persistence/knex-invoice.repository';
import { ada, scopeOf } from './support/scopes';

let database: TestDatabase;

beforeAll(async () => {
  database = await createDatabase(createInvoicesTable, [`${BILLING}.invoices`]);
});

afterAll(async () => {
  await database.close();
});

const repository = () =>
  new KnexInvoiceRepository(
    createKnexUnitOfWork(database.knex),
    scopeOf(ada),
    new FixedClock(new Date('2026-03-01T10:00:00.000Z')),
  );

let next = 0;

repositoryContract<Invoice>(
  { describe, it, expect, beforeEach, afterEach },
  {
    name: 'A knex repository built on executor() and saveTenantAggregate',
    createRepository: async () => {
      await database.truncate();

      return repository();
    },
    createAggregate: () => Invoice.draft(`inv-${(next += 1)}`, 100),
    createAggregateKeepingJson: (value) => Invoice.draftWithDetails(`inv-${(next += 1)}`, 100, value),
    mutate: (invoice) => invoice.addCharge(50),
    idOf: (invoice) => invoice.id,
    stateOf: (invoice) => invoice.state,
  },
);

describe('a repository declared with @Repository', () => {
  it('names its port, then the ports of its constructor in order', () => {
    const declare = Repository(InvoiceRepository, [KnexContext, ExecutionScope, Clock]);

    expect(() => declare(KnexInvoiceRepository)).not.toThrow();
  });
});

describe('saveAggregate, on a table no tenant column confines', () => {
  const clock = new FixedClock(new Date('2026-03-01T10:00:00.000Z'));
  const INVOICES = { schema: BILLING, table: 'invoices' };

  const saved = (invoice: Invoice): Promise<void> =>
    saveAggregate(createKnexUnitOfWork(database.knex), INVOICES, {
      aggregate: invoice,
      row: { id: invoice.id, amount: invoice.state.amount, status: invoice.state.status, tenant_id: 'acme' },
      scope: scopeOf(ada),
      clock,
    });

  it('inserts the row at version 1 with its creation stamp, then updates it while it holds the version it read', async () => {
    await database.truncate();

    const invoice = Invoice.draft('inv-plain', 100);

    await saved(invoice);
    invoice.addCharge(50);
    await saved(invoice);

    const row: unknown = await database.knex('invoices').withSchema(BILLING).where({ id: 'inv-plain' }).first();

    expect(row).toMatchObject({ amount: 150, version: 2, created_by: 'ada', updated_by: 'ada' });
    await expect(saved(loadedAt(Invoice.draft('inv-plain', 1), 1))).rejects.toBeInstanceOf(ConcurrencyError);
  });
});

describe('optimisticUpdate', () => {
  class Versioned extends AggregateRoot {
    constructor() {
      super('inv-1');
    }
  }

  const aggregate = (version: number) => loadedAt(new Versioned(), version);

  it('tells the write which version to expect and which to store, then moves the aggregate on', async () => {
    const invoice = aggregate(3);
    const steps: unknown[] = [];

    await optimisticUpdate(invoice, async (step) => {
      steps.push(step);

      return 1;
    });

    expect(steps).toEqual([{ expected: 3, next: 4 }]);
    expect(invoice.version).toBe(4);
  });

  it('raises a ConcurrencyError and leaves the version alone when no row was written', async () => {
    const invoice = aggregate(3);

    const failing = optimisticUpdate(invoice, async () => 0);

    await expect(failing).rejects.toBeInstanceOf(ConcurrencyError);

    await expect(optimisticUpdate(invoice, async () => 0)).rejects.toMatchObject({
      code: CONCURRENCY_CONFLICT,
      message: 'Aggregate inv-1 was modified concurrently',
    });

    expect(invoice.version).toBe(3);
  });

  it('raises a domain error, so presentation maps it like any other', () => {
    expect(new ConcurrencyError('inv-1')).toBeInstanceOf(DomainError);
    expect(CONCURRENCY_CONFLICT).toBe('CONCURRENCY_CONFLICT');
  });

  it('refuses to create an aggregate that already exists', async () => {
    await database.truncate();
    const subject = repository();

    await subject.save(Invoice.draft('inv-1', 100));

    await expect(subject.save(Invoice.draft('inv-1', 999))).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await subject.findById('inv-1'))?.state.amount).toBe(100);
  });
});

describe('schemaNameOf', () => {
  it('gives one schema per context, in snake_case', async () => {
    expect(schemaNameOf('billing')).toBe('billing');
    expect(schemaNameOf('order-management')).toBe('order_management');
    expect(BILLING).toBe('billing_core');
    expect(await database.knex.schema.withSchema(BILLING).hasTable('invoices')).toBe(true);
  });

  it.each(['Billing', 'billing_core', 'billing core', '-billing', 'billing-', '', '"; drop schema'])(
    'refuses the context name "%s"',
    (name) => {
      expect(() => schemaNameOf(name)).toThrow(TypeError);
    },
  );
});
