import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { trailerInMergeMessage } from '../src/merge/trailer-in-merge-message';
import { tempDir } from './helpers';
import { git } from './support/git';

describe('a trailer added to the message of a merge in progress', () => {
  it('writes each entry once: one an earlier `--continue` wrote under that key is not written again', () => {
    const root = fs.realpathSync(tempDir('merge-message'));

    git(root, 'init', '--quiet', '--initial-branch', 'main');
    fs.writeFileSync(path.join(root, '.git', 'MERGE_MSG'), 'Merge main into build/work\n\nKit-Written: a#1, b#2\n');

    trailerInMergeMessage(root, { key: 'Kit-Written', entries: ['b#2', 'c#3', 'c#3'] });
    trailerInMergeMessage(root, { key: 'Kit-Written', entries: ['a#1'] });

    expect(fs.readFileSync(path.join(root, '.git', 'MERGE_MSG'), 'utf8')).toBe(
      'Merge main into build/work\n\nKit-Written: a#1, b#2\nKit-Written: c#3\n',
    );
  });
});
