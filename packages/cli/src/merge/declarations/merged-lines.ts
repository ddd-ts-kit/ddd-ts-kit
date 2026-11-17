import { mergedFile, type Versions } from './merged-file';

/** What merges the lines of the three versions of a declaration; undefined when they do not merge without a conflict. */
export type LineMerge = (versions: Versions) => readonly string[] | undefined;

/**
 * The lines of a declaration both sides changed, merged as git merges a file, as merge-trunk
 * computes the merge of the tree. Undefined when the versions conflict, or when git cannot write
 * or merge them: the declaration is then left to a person.
 */
export function mergedLines(top: string, versions: Versions): string[] | undefined {
  return mergedFile(top, versions, false);
}
