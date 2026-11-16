import { describe, expect, it } from 'vitest';
import { INVOICES, KEPT, merged, ORDERS, REFUNDS, table, tablesFile } from './support/declared-tables-file';

describe('merge-trunk, in a file that holds a region of declarations', () => {
  it('keeps the hand-written code outside the regions, and says both what a region and the rest leave', () => {
    const file = (tables: readonly (readonly string[])[], helper: string): string =>
      `${tablesFile(tables)}\nexport function billingTableNames(): string[] {\n  return ${helper};\n}\n`;

    const settled = merged({
      base: file([ORDERS], "['orders']"),
      ours: file([ORDERS, INVOICES], "['orders']"),
      theirs: file([ORDERS, REFUNDS], "['orders']"),
    });

    expect(settled.content).toBe(file([ORDERS, REFUNDS, INVOICES], "['orders']"));

    const outside = merged({
      base: file([ORDERS], "['orders']"),
      ours: file([ORDERS, INVOICES], "['orders', 'invoices']"),
      theirs: file([ORDERS, REFUNDS], "['orders', 'refunds']"),
    });

    expect(outside).toMatchObject({ settled: false, how: 'a conflict outside any generated region' });
    expect(outside.advice).toBeUndefined();
    expect(outside.blocks).toHaveLength(1);
    expect(outside.content).toContain(tablesFile([ORDERS, REFUNDS, INVOICES]));

    const both = merged({
      base: file([ORDERS], "['orders']"),
      ours: file([ORDERS, table('invoices', "  total: integer('total'),")], "['orders', 'invoices']"),
      theirs: file([ORDERS, table('invoices', "  amount: integer('amount'),")], "['orders', 'refunds']"),
    });

    expect(both.blocks).toHaveLength(2);

    expect(both.advice).toMatch(
      /^the two sides do not agree on `invoices` .* For the other hunks, write the lines that keep the intent of each side\.$/,
    );
  });

  it('merges the imports each side added and one both added, written on one line or on several', () => {
    const oneLine = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, INVOICES], ["import { money } from '@/shared/money';", "import { a } from './a';"]),
      theirs: tablesFile([ORDERS, REFUNDS], ["import { money } from '@/shared/money';", "import { b } from './b';"]),
    });

    expect(oneLine.content).toBe(
      tablesFile(
        [ORDERS, REFUNDS, INVOICES],
        ["import { money } from '@/shared/money';", "import { a } from './a';", "import { b } from './b';"],
      ),
    );

    const several = (...names: readonly string[]): string[] => [
      'import {',
      ...names.map((name) => `  ${name},`),
      "} from './columns';",
    ];

    const onSeveralLines = merged({
      base: tablesFile([ORDERS], several('bigint', 'jsonb')),
      ours: tablesFile([ORDERS], [...several('bigint', 'jsonb'), ...['import {', '  first,', "} from './first';"]]),
      theirs: tablesFile(
        [ORDERS],
        [...several('bigint', 'jsonb', 'uuid'), 'import {', '  second,', "} from './second';"],
      ),
    });

    expect(onSeveralLines).toMatchObject({ settled: true });

    expect(onSeveralLines.content).toBe(
      tablesFile(
        [ORDERS],
        [
          "import { first } from './first';",
          "import { bigint, jsonb, uuid } from './columns';",
          "import { second } from './second';",
        ],
      ),
    );
  });

  it('merges imports that hold a comment as declarations, each statement whole', () => {
    const commented = (name: string): string[] => [
      'import {',
      `  ${name}, // what ${name} is for`,
      `} from './${name}';`,
    ];

    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS], commented('first')),
      theirs: tablesFile([ORDERS], commented('second')),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([ORDERS], [...commented('second'), ...commented('first')]));
  });

  it('leaves to a person a region it cannot read with certainty, as git wrote it', () => {
    const pattern = ['export const invoiceNumber = /^INV-\\d+$/;', ''];

    const sides = {
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, [...pattern, ...INVOICES]]),
      theirs: tablesFile([ORDERS, REFUNDS]),
    };

    const left = merged(sides);

    expect(left).toMatchObject({ settled: false, content: undefined });
    expect(left.blocks).toHaveLength(1);

    expect(left.advice).toBe(
      'the region `tables` holds declarations of several lines the kit could not read with certainty, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed.',
    );
  });
});

describe('merge-trunk, in a region that holds no code', () => {
  it('keeps the union of lines in a region of prose, whose brackets say nothing', () => {
    const register = (...rows: readonly string[]): string =>
      [
        '# Register',
        '<!-- ddd-ts-kit:personal-data-register -->',
        ...rows,
        '<!-- /ddd-ts-kit:personal-data-register -->',
        '',
      ].join('\n');

    const settled = merged(
      {
        base: register('1) orders'),
        ours: register('1) orders', '2) invoices'),
        theirs: register('1) orders', '3) refunds'),
      },
      'docs/privacy-register.md',
    );

    expect(settled).toMatchObject({ settled: true, how: 'generated registry: the lines of both sides kept' });
    expect(settled.content).toBe(register('1) orders', '2) invoices', '3) refunds'));
  });
});
