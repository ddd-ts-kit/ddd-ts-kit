import { changedFiles } from '../commit/changed-files';

/**
 * The files a worktree changed, relative to its top, sorted: committed since `mergeBase` when
 * given, modified (staged or not), and untracked but not ignored. The scope and the report of a
 * worker, under `.ddd-ts-kit/`, are not counted.
 */
export function worktreeFiles(worktree: string, mergeBase: string | undefined): string[] {
  return [...(changedFiles(worktree, mergeBase) ?? [])].filter((file) => !/(^|\/)\.ddd-ts-kit\//.test(file)).sort();
}
