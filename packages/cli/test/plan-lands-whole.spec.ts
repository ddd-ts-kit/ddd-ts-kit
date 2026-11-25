import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { read, tempDir, walk, write } from './helpers';
import { Workspace, type DiskWrites } from '../src/workspace';

/** A disk whose `k`-th write fails as a full disk does, half of the file written. */
function fullAt(k: number): DiskWrites {
  let writes = 0;

  return {
    writeFileSync(file, content) {
      writes += 1;

      if (writes === k) {
        fs.writeFileSync(file, content.slice(0, Math.floor(content.length / 2)));

        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }

      fs.writeFileSync(file, content);
    },
    renameSync: (from, to) => fs.renameSync(from, to),
  };
}

function plan(root: string, disk: DiskWrites): Workspace {
  const ws = new Workspace(root, false, disk);

  ws.create('src/a/one.ts', 'export const one = 1;\n');
  ws.update('kept.ts', 'export const kept = 2;\n');
  ws.create('src/b/three.ts', 'export const three = 3;\n');

  return ws;
}

describe('the plan of a command', () => {
  it.each([1, 2, 3])('lands nothing when its file %i cannot be written: no file, no temporary file, no folder', (k) => {
    const root = tempDir('plan');

    write(root, 'kept.ts', 'export const kept = 1;\n');

    expect(() => plan(root, fullAt(k)).commit(false)).toThrow('ENOSPC');

    expect(walk(root)).toEqual(['kept.ts']);
    expect(fs.readdirSync(root)).toEqual(['kept.ts']);
    expect(read(root, 'kept.ts')).toBe('export const kept = 1;\n');
  });

  it('lands whole on a disk that takes every file, and the same plan run after a failure completes', () => {
    const root = tempDir('plan');

    write(root, 'kept.ts', 'export const kept = 1;\n');

    expect(() => plan(root, fullAt(2)).commit(false)).toThrow('ENOSPC');

    expect(plan(root, fs).commit(false)).toMatchObject({
      created: ['src/a/one.ts', 'src/b/three.ts'],
      updated: ['kept.ts'],
      skipped: [],
    });

    expect(walk(root).sort()).toEqual(['kept.ts', 'src/a/one.ts', 'src/b/three.ts']);
  });

  it('leaves no temporary file when a file cannot be moved into place, the files moved before it kept', () => {
    const root = tempDir('plan');
    let moves = 0;

    const disk: DiskWrites = {
      writeFileSync: (file, content) => fs.writeFileSync(file, content),
      renameSync(from, to) {
        moves += 1;

        if (moves === 2) {
          throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
        }

        fs.renameSync(from, to);
      },
    };

    write(root, 'kept.ts', 'export const kept = 1;\n');

    expect(() => plan(root, disk).commit(false)).toThrow('EIO');
    expect(walk(root).sort()).toEqual(['kept.ts', 'src/a/one.ts']);
    expect(read(root, 'kept.ts')).toBe('export const kept = 1;\n');
  });
});
