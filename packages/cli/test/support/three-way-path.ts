import { conflictedPaths } from '../../src/merge/conflicted-paths';
import type { ConflictedPath } from '../../src/merge/conflicted-path';
import { previewMerge } from '../../src/merge/preview-merge';
import { mergeRepository } from './merge-repository';

/** The three sides of one file, as text. */
export interface ThreeSides {
  readonly base: string;
  readonly ours: string;
  readonly theirs: string;
}

/**
 * A conflicted path as merge-trunk reads it: the three sides of a file committed in a throwaway
 * repository, and the text the merge of the kit writes for them, conflicts as diff3 markers.
 */
export function threeWayPath(file: string, sides: ThreeSides): ConflictedPath {
  return threeWay(file, sides).path;
}

/** The same conflicted path, with the repository its sides are committed in. */
export function threeWay(file: string, { base, ours, theirs }: ThreeSides): { path: ConflictedPath; top: string } {
  const root = mergeRepository({ base: { [file]: base }, ours: { [file]: ours }, theirs: { [file]: theirs } });
  const preview = previewMerge(root, { ours: 'HEAD', theirs: 'main' });
  const [conflicted] = conflictedPaths(root, preview.conflicts, { tree: preview.tree });

  if (conflicted === undefined) {
    throw new Error(`git merges ${file} without a conflict: nothing of it is left to merge-trunk.`);
  }

  return { path: conflicted, top: root };
}
