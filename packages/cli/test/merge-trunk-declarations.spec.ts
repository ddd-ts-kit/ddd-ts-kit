import { describe, expect, it } from 'vitest';
import { INVOICES, KEPT, KEPT_WITH_LINES, merged, ORDERS, REFUNDS, tablesFile } from './support/declared-tables-file';

describe('merge-trunk, when both sides add a declaration of several lines to one region', () => {
  it('keeps the table of each side whole on Drizzle, the one of the trunk after the table it follows there', () => {
    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, INVOICES]),
      theirs: tablesFile([ORDERS, REFUNDS]),
    });

    expect(settled).toMatchObject({ kind: 'registry', settled: true, how: KEPT, blocks: [] });
    expect(settled.content).toBe(tablesFile([ORDERS, REFUNDS, INVOICES]));
  });

  it('keeps the entity of each side whole on TypeORM, with the import each side added', () => {
    const entity = (name: string, row: string): string[] => [
      `export const ${name} = new EntitySchema<${row}>({`,
      `  tableName: '${name}',`,
      '  columns: {',
      "    id: { type: 'text', primary: true },",
      "    version: { type: 'int' },",
      '  },',
      '});',
    ];

    const file = (rows: readonly string[], entities: readonly string[][]): string =>
      [
        '// ddd-ts-kit:imports',
        "import { EntitySchema } from 'typeorm';",
        ...rows.map((row) => `import type { ${row} } from '@/contexts/billing/${row}';`),
        '// /ddd-ts-kit:imports',
        '',
        '// ddd-ts-kit:tables',
        ...entities.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines])),
        '// /ddd-ts-kit:tables',
        '',
      ].join('\n');

    const orders = entity('orders', 'OrderRow');
    const invoices = entity('invoices', 'InvoiceRow');
    const refunds = entity('refunds', 'RefundRow');

    const settled = merged({
      base: file(['OrderRow'], [orders]),
      ours: file(['OrderRow', 'InvoiceRow'], [orders, invoices]),
      theirs: file(['OrderRow', 'RefundRow'], [orders, refunds]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT_WITH_LINES });
    expect(settled.content).toBe(file(['OrderRow', 'InvoiceRow', 'RefundRow'], [orders, refunds, invoices]));
  });

  it('keeps the function of each side whole on Knex, and the line that calls each', () => {
    const definition = (name: string): string[] => [
      `function create${name}Table(knex: Knex): Promise<void> {`,
      `  return knex.schema.withSchema(BILLING_SCHEMA).createTable('${name.toLowerCase()}s', (table) => {`,
      "    table.text('id').primary();",
      "    table.integer('version').notNullable();",
      '  });',
      '}',
    ];

    const file = (names: readonly string[], defined = names): string =>
      [
        'export async function createBillingTables(knex: Knex): Promise<void> {',
        '  // ddd-ts-kit:tables',
        ...names.map((name) => `  await create${name}Table(knex);`),
        '  // /ddd-ts-kit:tables',
        '}',
        '',
        '// ddd-ts-kit:definitions',
        ...defined.flatMap((name, at) => (at === 0 ? definition(name) : ['', ...definition(name)])),
        '// /ddd-ts-kit:definitions',
        '',
      ].join('\n');

    const settled = merged(
      { base: file(['Order']), ours: file(['Order', 'Invoice']), theirs: file(['Order', 'Refund']) },
      'src/contexts/billing/infrastructure/persistence/create-billing-tables.schema.ts',
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT_WITH_LINES });
    // The calls stand alone on their lines: the lines of both sides, ours first. The functions are merged one by one.
    expect(settled.content).toBe(file(['Order', 'Invoice', 'Refund'], ['Order', 'Refund', 'Invoice']));
  });

  it('keeps the model of each side whole on Prisma, where the two models differ at both ends', () => {
    const model = (name: string): string[] => [
      `model Billing${name} {`,
      '  id           String   @id',
      `  // TODO(domain): add one field per field of ${name}State; then run \`npm run db:client\`.`,
      '  version      Int',
      '  createdAt    DateTime @map("created_at") @db.Timestamptz(3)',
      '',
      `  @@map("${name.toLowerCase()}s")`,
      '  @@schema("billing")',
      '}',
    ];

    const file = (...names: readonly string[]): string =>
      [
        '// The models and enums of the bounded context billing.',
        '// ddd-ts-kit:models',
        ...names.flatMap((name, at) => (at === 0 ? model(name) : ['', ...model(name)])),
        '// /ddd-ts-kit:models',
        '',
      ].join('\n');

    const settled = merged(
      { base: file('Order'), ours: file('Order', 'Invoice'), theirs: file('Order', 'Refund') },
      'prisma/schema/billing.prisma',
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(file('Order', 'Refund', 'Invoice'));
  });
});
