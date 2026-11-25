import { describe, expect, it } from 'vitest';
import { cli, read } from './helpers';
import { initProject } from './support/init-project';

const PERSISTENCE = 'src/contexts/billing/infrastructure/persistence';

function repositoryOn(orm: string, file: string, ...flags: string[]): string {
  const root = initProject('--orm', orm, '--audit', 'off', '--context', 'billing:core', ...flags);

  cli(root, 'generate', 'aggregate', 'billing', 'Invoice', '--allow-name');
  cli(root, 'generate', 'repository', 'billing', 'Invoice', '--allow-name');

  return read(root, `${PERSISTENCE}/${file}`);
}

describe('the save of a generated repository', () => {
  it.each([
    ['drizzle', 'drizzle-invoice.repository.ts', 'await saveAggregate(this.database, invoices, {'],
    ['knex', 'knex-invoice.repository.ts', 'await saveAggregate(this.database, TABLE, {'],
    ['prisma', 'prisma-invoice.repository.ts', 'await saveAggregate(this.database.client().billingInvoice, {'],
    ['typeorm', 'type-orm-invoice.repository.ts', 'await saveAggregate(this.database, invoices, {'],
  ])(
    'is one call of the save of the ORM package on %s, which tells a taken id from another unique value',
    (orm, file, call) => {
      const repository = repositoryOn(orm, file);

      expect(repository).toContain(`${call}\n      aggregate: saved,\n      row: InvoiceMapper.toRow(saved),`);

      expect(repository).not.toMatch(
        /optimisticUpdate|insertIgnoringConflict|rowsCreated|stampCreation|private (?:async )?(?:insert|update)/,
      );
    },
  );

  it('is the save confined to the tenant of the work on a tenant-scoped aggregate of Prisma', () => {
    const repository = repositoryOn('prisma', 'prisma-invoice.repository.ts', '--tenancy', 'shared-table');

    expect(repository).toContain('await saveTenantAggregate(this.database.client().billingInvoice, {');
  });
});
