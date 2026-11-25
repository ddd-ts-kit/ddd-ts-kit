import { runGit } from './run-git';

/** A renamed file counts under both its names, and `-z` gives every name as it is on disk, never quoted. */
const NAMES = ['--name-only', '--no-renames', '--relative', '-z'];

/**
 * The files under `directory` that changed, relative to it: committed since the branch left `since`
 * when one is given (since `since` itself when they share no history), modified in the index or the
 * working tree, and new files git does not track yet and does not ignore. Nothing when git cannot
 * answer: not a repository, or a ref it does not know.
 */
export function changedFiles(directory: string, since?: string): ReadonlySet<string> | undefined {
  const committed = since === undefined ? [] : namesOf(directory, ['diff', ...NAMES, forkOf(directory, since), 'HEAD']);
  const modified = namesOf(directory, ['diff', ...NAMES, 'HEAD']);
  const untracked = namesOf(directory, ['ls-files', '--others', '--exclude-standard', '-z']);

  return committed === undefined || modified === undefined || untracked === undefined
    ? undefined
    : new Set([...committed, ...modified, ...untracked]);
}

function forkOf(directory: string, since: string): string {
  return runGit(directory, ['merge-base', since, 'HEAD'])?.trim() ?? since;
}

function namesOf(directory: string, args: readonly string[]): string[] | undefined {
  return runGit(directory, args)
    ?.split('\0')
    .filter((name) => name !== '');
}
