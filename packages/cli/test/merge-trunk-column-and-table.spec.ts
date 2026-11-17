import { describe, expect, it } from 'vitest';
import { read, write } from './helpers';
import { base, store, tablesFileOf } from './support/both-sides-add-a-table';
import { COLUMN_STACKS, columnAndTable, hunkOf, ON_DRIZZLE, withColumn } from './support/column-and-table';
import { git } from './support/git';
import { goOn, mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

/** Removes the comment the generator left in the table of the orders. */
function withoutComment(root: string, orm: string): void {
  const file = tablesFileOf(root, orm);

  write(root, file, read(root, file).replace(/\n[^\n]*TODO\(domain\)[^\n]*Order[^\n]*/, ''));
}

describe('merge-trunk, when the branch added a column to a table and stored an aggregate below it', () => {
  it.each(COLUMN_STACKS)('stops on the table when the trunk added a column at the same place, on $orm', (stack) => {
    const { orm, column, table, region, added } = stack;

    const root = columnAndTable(stack, (project) => withColumn(project, stack, 'sentTo'));

    const file = tablesFileOf(root, orm);
    const advice = `    the two sides do not agree on \`${table}\` in the region \`${region}\`: for each, write the one declaration that keeps the intent of both, whole, or remove it. Never take one side of the whole file.`;

    expect(mergeTrunk(root, '--dry-run').stdout).toContain(advice);

    const stopped = mergeTrunk(root);

    expect(stopped.code).toBe(1);
    expect(stopped.stdout).toContain(advice);
    expect(stopped.stdout).toContain('stopped: 1 conflicted path left for you');

    const text = read(root, file);
    const { hunk, ours, theirs } = hunkOf(text);
    const invoices = added.exec(text)?.[0] ?? '';

    expect(text.match(/^<{7} /gm)).toHaveLength(1);
    expect(ours).toContain(column('paidBy'));
    expect(ours).not.toContain(column('sentTo'));
    expect(theirs).toContain(column('sentTo'));
    expect(theirs).not.toContain(column('paidBy'));
    expect(invoices).not.toBe('');
    expect(invoices).not.toContain('sentTo');
    expect(text.split(invoices)).toHaveLength(2);

    write(root, file, text.replace(hunk, ours.replace(column('paidBy'), `${column('paidBy')}\n${column('sentTo')}`)));
    git(root, 'add', file);

    expect(goOn(root, '--continue').stdout).toContain('committed');
    expect(read(root, file)).toContain(`${column('paidBy')}\n${column('sentTo')}`);
  });

  it.each(COLUMN_STACKS)(
    'keeps the lines of both sides when the trunk only removed the comment of the table, on $orm',
    (stack) => {
      const { orm, column } = stack;

      const root = twoSides({
        orm,
        base: base(false),
        branch: (project) => {
          withColumn(project, stack, 'paidBy');
          store(project, 'Invoice');
        },
        trunk: (project) => withoutComment(project, orm),
      });

      const file = tablesFileOf(root, orm);
      const ours = read(root, file);
      const merged = mergeTrunk(root);

      expect(merged.code, merged.stdout).toBe(0);
      expect(merged.stdout).toContain(`  ${file}  generated registry: the lines of both sides kept`);
      expect(ours).toContain(column('paidBy'));
      expect(read(root, file)).toBe(ours.replace(/\n[^\n]*TODO\(domain\)[^\n]*Order[^\n]*/, ''));
    },
  );

  it('keeps the column in its table when the trunk set the tables in another order', () => {
    const moved = /(export const orders = [^]*?\n\}\);\n)\n(export const invoices = [^]*?\n\}\);\n)/;

    const root = twoSides({
      orm: 'drizzle',
      base: (project) => {
        base(false)(project);
        store(project, 'Invoice');
      },
      branch: (project) => withColumn(project, ON_DRIZZLE, 'paidBy'),
      trunk: (project) => {
        const file = tablesFileOf(project, 'drizzle');

        write(project, file, read(project, file).replace(moved, '$2\n$1'));
      },
    });

    const file = tablesFileOf(root, 'drizzle');
    const ours = read(root, file);
    const merged = mergeTrunk(root);

    expect(merged.code, merged.stdout).toBe(0);

    expect(merged.stdout).toContain(
      `  ${file}  generated registry: the declarations of both sides kept, each one whole`,
    );

    expect(ours).toContain("  paidBy: text('paidBy'),\n  version:");
    expect(read(root, file)).toBe(ours.replace(moved, '$2\n$1'));
  });
});
