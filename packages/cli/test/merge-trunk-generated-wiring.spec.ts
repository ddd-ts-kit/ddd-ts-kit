import { describe, expect, it } from 'vitest';
import {
  BILLING_MODULE,
  BILLING_TABLES,
  billingWiredByHand,
  command,
  edit,
  regionLines,
} from './support/billing-wired-by-hand';
import { mergeTrunk } from './support/trunk-history';

/** The repository of an aggregate as the generator declares it in the handlers, with more arguments. */
function repository(aggregate: string, more = ''): string[] {
  const name = `${aggregate.charAt(0).toLowerCase()}${aggregate.slice(1)}`;

  return [
    `  const ${name}Repository = platform.adapter(`,
    `    new Drizzle${aggregate}Repository(platform.persistence.database, platform.scope, platform.clock${more}),`,
    `    { kind: 'repository', context: 'billing', token: '${aggregate}Repository' },`,
    '  );',
  ];
}

/** The registration of a command as the generator writes it. */
function registration(name: string, aggregate: string, options = "{ context: 'billing' }"): string {
  const repositoryName = `${aggregate.charAt(0).toLowerCase()}${aggregate.slice(1)}Repository`;

  return `  platform.commands.register(${name}Command, new ${name}Handler(${repositoryName}), ${options});`;
}

/** A project merged, its exit code 0, the file said merged as the lines of both sides. */
function mergedByLines(root: string, file: string): void {
  const merged = mergeTrunk(root);

  expect(merged.code, merged.stdout).toBe(0);
  expect(merged.stdout).toContain(`  ${file}  generated registry: the lines of both sides kept`);
  expect(merged.stdout).toContain('committed');
}

/** The repository of invoices moved above that of orders, which now takes it. */
function invoicesFirst(text: string): string {
  const block = `${repository('Invoice').join('\n')}\n\n`;

  return text
    .replace(block, '')
    .replace(repository('Order').join('\n'), `${block}${repository('Order', ', invoiceRepository').join('\n')}`);
}

describe('merge-trunk, when both sides ran a generator on one aggregate of a project wired by hand', () => {
  it('keeps the order the trunk gave the repositories, each side having added a command on Refund', () => {
    const root = billingWiredByHand({
      branch: (project) => command(project, 'SendRefund', 'Refund'),
      trunk: (project) => {
        command(project, 'VoidRefund', 'Refund');
        edit(project, BILLING_MODULE, invoicesFirst);
      },
    });

    mergedByLines(root, BILLING_MODULE);

    expect(regionLines(root, BILLING_MODULE, 'handlers')).toEqual([
      ...repository('Invoice'),
      '',
      ...repository('Order', ', invoiceRepository'),
      '',
      registration('PlaceOrder', 'Order'),
      '',
      registration('IssueInvoice', 'Invoice'),
      '',
      ...repository('Refund'),
      '',
      registration('SendRefund', 'Refund'),
      registration('VoidRefund', 'Refund'),
    ]);
  }, 60_000);

  it('keeps the edit the branch made to a registration, each side having added a first command on Refund', () => {
    const audited = "{ context: 'billing', audited: true }";

    const root = billingWiredByHand({
      branch: (project) => {
        command(project, 'SendRefund', 'Refund');

        edit(project, BILLING_MODULE, (text) =>
          text.replace(registration('PlaceOrder', 'Order'), registration('PlaceOrder', 'Order', audited)),
        );
      },
      trunk: (project) => command(project, 'VoidRefund', 'Refund'),
    });

    mergedByLines(root, BILLING_MODULE);

    expect(regionLines(root, BILLING_MODULE, 'handlers')).toEqual([
      ...repository('Order'),
      '',
      registration('PlaceOrder', 'Order', audited),
      '',
      ...repository('Invoice'),
      '',
      registration('IssueInvoice', 'Invoice'),
      '',
      ...repository('Refund'),
      '',
      registration('SendRefund', 'Refund'),
      registration('VoidRefund', 'Refund'),
    ]);
  }, 60_000);

  it('keeps once the repository both sides declared for a first command on Refund, then the command of each', () => {
    const root = billingWiredByHand({
      branch: (project) => command(project, 'SendRefund', 'Refund'),
      trunk: (project) => command(project, 'VoidRefund', 'Refund'),
    });

    mergedByLines(root, BILLING_MODULE);

    expect(regionLines(root, BILLING_MODULE, 'handlers')).toEqual([
      ...repository('Order'),
      '',
      registration('PlaceOrder', 'Order'),
      '',
      ...repository('Invoice'),
      '',
      registration('IssueInvoice', 'Invoice'),
      '',
      ...repository('Refund'),
      '',
      registration('SendRefund', 'Refund'),
      registration('VoidRefund', 'Refund'),
    ]);
  }, 60_000);
});

describe('merge-trunk, when both sides wrote the same lines by hand in a region, then one of their own', () => {
  it('keeps once the wrapped entry both added to the routes, then the entry of each', () => {
    const wrapped = [
      '    ...controllerRoutes([',
      '      new PlaceOrderController(platform.commands, platform.queries, platform.clock),',
      '    ]),',
    ];

    const routes =
      (own: string) =>
      (text: string): string =>
        text.replace('    // ddd-ts-kit:routes\n', `    // ddd-ts-kit:routes\n${[...wrapped, own].join('\n')}\n`);

    const root = billingWiredByHand({
      branch: (project) => edit(project, BILLING_MODULE, routes('    ...sendRoutes(platform),')),
      trunk: (project) => edit(project, BILLING_MODULE, routes('    ...voidRoutes(platform),')),
    });

    mergedByLines(root, BILLING_MODULE);

    expect(regionLines(root, BILLING_MODULE, 'routes')).toEqual([
      ...wrapped,
      '    ...sendRoutes(platform),',
      '    ...voidRoutes(platform),',
    ]);
  }, 60_000);

  it('keeps once the column of three lines both added to a table of Drizzle, then the column of each', () => {
    const status = ["  status: text('status', {", "    enum: ['placed', 'paid'],", '  }).notNull(),'];
    const version = "  version: integer('version').notNull(),";

    const columns =
      (own: string) =>
      (text: string): string =>
        text.replace(version, `${[...status, own, version].join('\n')}`);

    const root = billingWiredByHand({
      branch: (project) => edit(project, BILLING_TABLES, columns("  total: integer('total').notNull(),")),
      trunk: (project) => edit(project, BILLING_TABLES, columns("  amount: integer('amount').notNull(),")),
    });

    mergedByLines(root, BILLING_TABLES);

    expect(regionLines(root, BILLING_TABLES, 'tables').slice(2, 9)).toEqual([
      expect.stringContaining('// TODO(domain)'),
      ...status,
      "  total: integer('total').notNull(),",
      "  amount: integer('amount').notNull(),",
      version,
    ]);
  }, 60_000);
});
