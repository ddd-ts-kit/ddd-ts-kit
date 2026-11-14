import { describe, expect, it } from 'vitest';
import { read, write } from './helpers';
import { git } from './support/git';
import { INDEX, store } from './support/index-invariant';
import { goOn, merging, mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

/** Each conflict of a file resolved by keeping our side only: what a careless resolution does. */
function keepOursOnly(root: string): void {
  for (const file of git(root, 'diff', '--name-only', '--diff-filter=U')
    .split('\n')
    .filter((path) => path !== '')) {
    let side: 'ours' | 'base' | 'theirs' | undefined;

    const kept = read(root, file)
      .split('\n')
      .filter((line) => {
        const marker = /^(<{7}|\|{7}|={7}|>{7})/.exec(line)?.[1];

        side =
          marker === undefined
            ? side
            : marker.startsWith('<')
              ? 'ours'
              : marker.startsWith('|')
                ? 'base'
                : marker.startsWith('=')
                  ? 'theirs'
                  : undefined;

        return marker === undefined && (side === undefined || side === 'ours');
      });

    write(root, file, kept.join('\n'));
  }

  git(root, 'add', '--all');
}

/** A line each side adds at the end of the index, one name each: the two conflict. */
function appended(project: string, line: string): void {
  write(project, INDEX, `${read(project, INDEX)}${line}\n`);
}

/** Two sides that each store an Order and add a line at the end of the index, merged, the resolution keeping ours only, continued. */
function mergedLosingTheTrunkLine(orm: string): { root: string; continued: string } {
  const root = twoSides({
    orm,
    trunk: (project) => {
      store(project, 'billing', 'Order');
      appended(project, 'export const legacyTrunk = [outbox];');
    },
    branch: (project) => {
      store(project, 'shipping', 'Order');
      store(project, 'returns', 'Order');
      appended(project, 'export const legacyBranch = [outbox];');
    },
  });

  const started = mergeTrunk(root);

  expect(merging(root), started.stdout).toBe(true);
  keepOursOnly(root);

  return { root, continued: goOn(root, '--continue').stdout };
}

/** The entries of a trailer of the merge message in progress. */
function entries(root: string, key: string): string[] {
  const message = read(root, '.git/MERGE_MSG');

  return [...message.matchAll(new RegExp(`^${key}:(.*)$`, 'gm'))].flatMap(([, held = '']) =>
    held.split(/[\s,]+/).filter((entry) => entry !== ''),
  );
}

describe('merge-trunk on typeorm, a merge that lost a line of the trunk', () => {
  it('stops on the line the resolution lost, exactly as main: the kit writes no line of the index, and records none', () => {
    const { root, continued } = mergedLosingTheTrunkLine('typeorm');

    expect(merging(root), continued).toBe(true);
    expect(continued).toMatch(/lost lines: \d+ error/);
    expect(continued).toContain('export const legacyTrunk = [outbox];');
    goOn(root, '--continue');

    expect({ written: entries(root, 'Kit-Written'), accepted: entries(root, 'Lost-Accepted') }).toEqual({
      written: [],
      accepted: [],
    });
  });
});

describe('merge-trunk on drizzle, a settle in a merge that lost a line of the trunk', () => {
  it("stops on the line the resolution lost, as on main: the lines the kit wrote are never the merge's own", () => {
    const { root, continued } = mergedLosingTheTrunkLine('drizzle');

    expect(merging(root), continued).toBe(true);
    expect(continued).toMatch(/lost lines: \d+ error/);
    expect(continued).toContain('export const legacyTrunk = [outbox];');
    // A line the settle took out is accepted by its file, its side and its text; the lines it wrote are named apart.
    goOn(root, '--continue');

    const written = entries(root, 'Kit-Written');
    const accepted = entries(root, 'Lost-Accepted');

    expect(written.length).toBeGreaterThan(0);
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.every((entry) => /@(?:ours|theirs|both)#[0-9a-f]{12}$/.test(entry))).toBe(true);
    expect(new Set(written).size).toBe(written.length);
    expect(new Set(accepted).size).toBe(accepted.length);
  });
});
