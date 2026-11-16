import { describe, expect, it } from 'vitest';
import { scan } from '../src/check/scan/scan';
import { bracketsLeftOpen } from '../src/merge/declarations/brackets-left-open';
import { read, write } from './helpers';
import { base, bothSidesAddATable, store, TABLES, tablesFileOf } from './support/both-sides-add-a-table';
import { git } from './support/git';
import { goOn, mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const CASES = ['drizzle', 'typeorm', 'knex', 'prisma'].flatMap((orm) => [
  { orm, layout: 'flat', modules: false },
  { orm, layout: 'laid out in modules', modules: true },
]);

describe('merge-trunk, when the trunk and the branch each added a table to one context', () => {
  it.each(CASES)('keeps both tables whole on $orm, the context $layout', ({ orm, modules }) => {
    const root = bothSidesAddATable(orm, modules);
    const file = tablesFileOf(root, orm);
    const previewed = mergeTrunk(root, '--dry-run');
    const merged = mergeTrunk(root);
    const text = read(root, file);

    expect(previewed.stdout).toContain(
      `${file}  generated registry: the declarations of both sides kept, each one whole`,
    );

    expect(merged.code, merged.stdout).toBe(0);
    expect(merged.stdout).toContain('committed');
    expect(bracketsLeftOpen(scan(text).code)).toEqual([]);
    expect(text).not.toMatch(/^(?:<{7}|={7}|>{7})/m);

    for (const declared of TABLES[orm] ?? []) {
      expect(text.split(declared)).toHaveLength(2);
    }

    expect(git(root, 'status', '--porcelain').trim()).toBe('');
  });

  it('stops on a table both sides added under one name with different columns, whole in the conflict, and goes on once it is settled', () => {
    const withColumn = (column: string) => (root: string) => {
      store(root, 'Invoice');
      const file = tablesFileOf(root, 'drizzle');

      write(
        root,
        file,
        read(root, file).replace(/(invoices'[^]*?)(\n {2}version:)/, `$1\n  ${column}: text('${column}'),$2`),
      );
    };

    const root = twoSides({
      orm: 'drizzle',
      base: base(false),
      branch: withColumn('paidBy'),
      trunk: withColumn('sentTo'),
    });

    const file = tablesFileOf(root, 'drizzle');
    const advice = `    the two sides do not agree on \`invoices\` in the region \`tables\`: for each, write the one declaration that keeps the intent of both, whole, or remove it. Never take one side of the whole file.`;

    expect(mergeTrunk(root, '--dry-run').stdout).toContain(advice);

    const stopped = mergeTrunk(root);

    expect(stopped.code).toBe(1);
    expect(stopped.stdout).toContain(advice);
    expect(stopped.stdout).toContain('stopped: 1 conflicted path left for you');

    const [, ours = '', theirs = ''] =
      /<{7} [^\n]*\n([^]*?)\|{7} [^\n]*\n={7}\n([^]*?)>{7} [^\n]*\n/.exec(read(root, file)) ?? [];

    expect(ours).toMatch(/^export const invoices = [^]*paidBy[^]*\}\);\n$/);
    expect(theirs).toMatch(/^export const invoices = [^]*sentTo[^]*\}\);\n$/);

    write(
      root,
      file,
      read(root, file).replace(
        /<{7} [^]*>{7} [^\n]*\n/,
        ours.replace(/(\n {2}version:)/, "\n  sentTo: text('sentTo'),$1"),
      ),
    );

    git(root, 'add', file);

    const settled = goOn(root, '--continue');

    expect(settled.stdout).toContain('committed');
    expect(bracketsLeftOpen(scan(read(root, file)).code)).toEqual([]);
    expect(read(root, file)).toMatch(/paidBy[^]*sentTo/);
  });
});
