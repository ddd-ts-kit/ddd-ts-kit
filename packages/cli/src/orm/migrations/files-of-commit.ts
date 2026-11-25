import { runGit } from '../../commit/run-git';

/** The files a commit holds under a folder of the project, at any depth, each from the project root. */
export function filesOfCommit(root: string, commit: string, folder: string): string[] {
  return (runGit(root, ['ls-tree', '-r', '--name-only', commit, '--', `${folder}/`]) ?? '')
    .split('\n')
    .filter((file) => file !== '');
}
