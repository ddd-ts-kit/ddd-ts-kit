import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile, registered, registeredOnLines } from './support/billing-module-file';
import { INVOICES, KEPT, merged, ORDERS, REFUNDS, tablesFile } from './support/declared-tables-file';

/** The repository of an aggregate as the generator declares it, with what it is given. */
function repository(name: string, given = 'platform.database'): string[] {
  return [`  const ${name}Repository = platform.adapter(`, `    new ${name}Store(${given}),`, '  );'];
}

const ORDER = repository('order');
const INVOICE = repository('invoice');
const BASE = [ORDER, registered('PlaceOrder'), INVOICE, registered('IssueInvoice')];

/** The repository of invoices moved above that of orders, which takes it. */
const MOVED = [
  INVOICE,
  repository('order', 'platform.database, invoiceRepository'),
  ...BASE.slice(1, 2),
  ...BASE.slice(3),
];

describe('merge-trunk, when a side changed the order of the declarations of a region merged by declaration', () => {
  it('keeps the order of the trunk when the trunk alone changed it', () => {
    const settled = merged(
      {
        base: moduleFile(...BASE),
        ours: moduleFile(...BASE, registeredOnLines('SendRefund')),
        theirs: moduleFile(...MOVED, registeredOnLines('VoidRefund')),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      moduleFile(...MOVED, registeredOnLines('SendRefund'), registeredOnLines('VoidRefund')),
    );
  });

  it('keeps the order of the branch when the branch alone changed it', () => {
    const settled = merged(
      {
        base: moduleFile(...BASE),
        ours: moduleFile(...MOVED, registeredOnLines('SendRefund')),
        theirs: moduleFile(...BASE, registeredOnLines('VoidRefund')),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      moduleFile(...MOVED, registeredOnLines('VoidRefund'), registeredOnLines('SendRefund')),
    );
  });

  it('writes nothing when both changed it, each its own way', () => {
    const left = merged(
      {
        base: moduleFile(...BASE),
        ours: moduleFile(...MOVED, registeredOnLines('SendRefund')),
        theirs: moduleFile(BASE[2] ?? [], BASE[3] ?? [], BASE[0] ?? [], BASE[1] ?? [], registeredOnLines('VoidRefund')),
      },
      MODULE_FILE,
    );

    expect(left).toMatchObject({
      settled: false,
      content: undefined,
      advice:
        'the region `handlers` holds declarations the two sides set in two different orders, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed, in the order that holds for both.',
    });
  });
});

describe('merge-trunk, on the entries of a list written on several lines', () => {
  it('writes nothing when each side added a different wrapped entry: no line says where an entry ends', () => {
    const routes = (...entries: readonly string[]): string =>
      [
        'function routesOf(platform: Platform): Route[] {',
        '  return [',
        '    // ddd-ts-kit:routes',
        ...entries,
        '    // /ddd-ts-kit:routes',
        '  ];',
        '}',
        '',
      ].join('\n');

    const wrapped = (controller: string): string[] => [
      '    ...controllerRoutes([',
      `      new ${controller}Controller(platform.commands, platform.queries, platform.clock),`,
      '    ]),',
    ];

    const left = merged(
      { base: routes(), ours: routes(...wrapped('PlaceOrder')), theirs: routes(...wrapped('CancelOrder')) },
      MODULE_FILE,
    );

    expect(left).toMatchObject({
      settled: false,
      content: undefined,
      advice:
        'the region `routes` holds lines that end no statement (entries of a list, or statements written without `;`) on which the two sides differ, which the kit does not merge one by one, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed.',
    });

    expect(left.blocks).toHaveLength(1);
  });
});

describe('merge-trunk, on a type whose members follow a closing brace', () => {
  it('keeps every member of two unions that end on the same line, and of two conditional types', () => {
    const union = (name: string): string[] => [
      `export type ${name} =`,
      `  | { kind: '${name}' }`,
      "  | { kind: 'none' };",
    ];

    const conditional = (name: string): string[] => [
      `export type ${name}<T> = T extends string`,
      `  ? { text: T; of: '${name}' }`,
      '  : { none: true };',
    ];

    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, INVOICES, union('Paid'), conditional('Sent')]),
      theirs: tablesFile([ORDERS, REFUNDS, union('Voided'), conditional('Kept')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      tablesFile([ORDERS, REFUNDS, union('Voided'), conditional('Kept'), INVOICES, union('Paid'), conditional('Sent')]),
    );
  });
});

describe('merge-trunk, on a region written inside one it leaves', () => {
  it('settles no conflict of the inner region by the lines of both sides', () => {
    const nested = (tables: readonly (readonly string[])[]): string =>
      tablesFile([
        [
          '// ddd-ts-kit:aggregates',
          ...tables.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines])),
          '// /ddd-ts-kit:aggregates',
        ],
      ]);

    const left = merged({
      base: nested([ORDERS]),
      ours: nested([ORDERS, INVOICES]),
      theirs: nested([ORDERS, REFUNDS]),
    });

    expect(left).toMatchObject({
      settled: false,
      content: undefined,
      how: 'a conflict in the declarations of the region `tables`',
    });

    expect(left.advice).toContain(
      'the region `tables` holds declarations of several lines the kit could not read with certainty',
    );
  });
});
