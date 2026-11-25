import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, exists, tempDir } from './helpers';
import { initProject } from './support/init-project';
import { holderOf } from '../src/generator-lock/holder-of';
import { ownLock } from '../src/generator-lock/own-lock';
import { removeStale } from '../src/generator-lock/remove-stale';

const LOCK = '.ddd-ts-kit/lock';
/** A process id no process of this machine bears: a command that ended. */
const ENDED = 2 ** 22 - 3;

function lockLeftBehind(root: string, command = 'ddd-ts-kit generate context billing'): string {
  const lock = path.join(root, LOCK);

  fs.mkdirSync(lock, { recursive: true });

  fs.writeFileSync(
    path.join(lock, 'holder.json'),
    JSON.stringify({ command, pid: ENDED, host: os.hostname(), startedAt: new Date(Date.now() - 1000).toISOString() }),
  );

  return lock;
}

describe('two commands that take over one lock left behind', () => {
  it('never both hold it: the one that moves aside a lock taken meanwhile gives it back', () => {
    const root = tempDir('lock-takeover');
    const lock = lockLeftBehind(root);
    const place = { folder: path.dirname(lock), lock, command: 'second', disk: fs };
    const judged = holderOf(lock);

    if (judged === undefined) {
      throw new Error('no lock to judge');
    }

    let taken: ReturnType<typeof ownLock> = 'held';
    let moves = 0;

    // The first command is about to move the lock aside when the second one, which judged it stale too, takes it over.
    const first = {
      renameSync(from: string, to: string): void {
        moves += 1;

        if (moves === 1) {
          removeStale(lock, judged);
          taken = ownLock(place);
        }

        fs.renameSync(from, to);
      },
    };

    removeStale(lock, judged, first);

    expect(taken).toMatchObject({ lock });
    expect(holderOf(lock)).toMatchObject({ command: 'second', pid: process.pid });
    expect(ownLock({ ...place, command: 'first' })).toBe('held');
    expect(fs.readdirSync(path.dirname(lock))).toEqual(['lock']);
  });

  it('remove the lock that is the one judged stale, and nothing beside it', () => {
    const root = tempDir('lock-takeover');
    const lock = lockLeftBehind(root);
    const judged = holderOf(lock);

    if (judged !== undefined) {
      removeStale(lock, judged);
    }

    expect(fs.readdirSync(path.dirname(lock))).toEqual([]);
  });
});

describe('the commands that write the shared files of a project', () => {
  const WRITING: readonly (readonly string[])[] = [
    ['generate', 'entity', 'billing', 'Line', '--term', 'Line=one row'],
    ['docs'],
    ['docs', '--behaviour'],
    ['sdk'],
    ['depcruise-config', '--write'],
    ['move-to-module', 'billing', 'invoicing', 'Invoice'],
    ['context-layout', 'billing'],
    ['platform-folders'],
    ['controllers'],
    ['value-objects'],
    ['error-factories', '--apply'],
    ['acceptance', '--lock'],
    ['init'],
  ];

  it.each(WRITING)('take the lock of the project, a lock left behind taken over on the way: %s', (...command) => {
    const root = initProject('--context', 'billing:core');

    lockLeftBehind(root);
    cli(root, ...command);

    expect(exists(root, LOCK)).toBe(false);
  });

  it('take no lock when they only say what they would write: one left behind stays', () => {
    const root = initProject('--context', 'billing:core');
    const lock = lockLeftBehind(root);

    const asked = [
      ['docs', '--check'],
      ['docs', '--dry-run'],
      ['sdk', '--check'],
      ['generate', 'entity', 'billing', 'Line', '--term', 'Line=one row', '--dry-run'],
      ['init', '--dry-run'],
      ['describe'],
      ['depcruise-config', '--check'],
      ['acceptance'],
      ['error-factories', '--plan', '--dry-run'],
    ];

    for (const command of asked) {
      cli(root, ...command);

      expect(fs.existsSync(lock), command.join(' ')).toBe(true);
    }
  });

  it('take no lock where there is no project yet', () => {
    const root = tempDir('lock-takeover');

    lockLeftBehind(root);

    expect(cli(root, 'init', '--context', 'billing:core').code).toBe(0);
    expect(exists(root, LOCK)).toBe(true);
  });
});
