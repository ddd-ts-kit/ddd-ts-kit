import type { FileReader } from '../generate/kinds/same-name/sources-of';
import type { MergeContext } from './merge-context';
import { treeFiles } from './tree-files';

/**
 * Reads a file of one side of a merge, in its commit: a symbolic link reads as `LINKED`, never as
 * the path it holds. The commit is listed once, at the first read.
 */
export function sideReader(repo: MergeContext['repo'], commit: string): FileReader {
  let read: FileReader | undefined;

  return (file) => {
    read ??= treeFiles(repo, { tree: commit, preloaded: [] }).read;

    return read(file);
  };
}
