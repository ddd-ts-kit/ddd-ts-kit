import { CliError } from '../../cli-error';
import { changedFiles } from '../../commit/changed-files';

/**
 * The files `check --changed-since` and `verify-slice --since` judge: those changed since the branch
 * left `commit`, the commit a ref the caller checked names. Refused when git cannot list them.
 */
export function changedSince(root: string, commit: string): ReadonlySet<string> {
  const changed = changedFiles(root, commit);

  if (changed === undefined) {
    throw new CliError(
      `Could not list the files changed since ${commit.slice(0, 7)}.`,
      'Check that the directory is a git repository and that the ref exists (fetch it in CI with enough history).',
    );
  }

  return changed;
}
