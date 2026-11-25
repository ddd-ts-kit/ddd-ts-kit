// The repository of a checkout, read from git's own files without running git: its top, its git
// directory, its worktrees that hold a worker; and the names of the two scope files the kit keeps in a
// checkout. Every mode reads it.
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { filesIn, isDirectory, isOwnFolder, readText, realOf } from './disk.mjs';

export const WORKER_SCOPE = '.ddd-ts-kit/worker.json';
// The worktree of a story one session takes to its pull request; its code waits for the build gate.
export const STORY_SCOPE = '.ddd-ts-kit/story.json';

// The git directory of the checkout holding the root (its own in a linked worktree), read from .git.
export function gitDirOf(root) {
  const top = repositoryTop(root);
  if (!top) {
    return undefined;
  }
  const dotGit = join(top, '.git');
  return isDirectory(dotGit) ? dotGit : resolve(top, /^gitdir:\s*(.+)$/m.exec(readText(dotGit, ''))?.[1] ?? '');
}

export function hasWorkerWorktree(root) {
  return workerWorktrees(root).length > 0;
}

// Read from git's own files, without running git: the worktrees of the repository listed under
// its common directory that hold the scope of a worker, each by the root of the project in it.
export function workerWorktrees(root) {
  const top = repositoryTop(root);
  const gitDir = gitDirOf(root);
  if (!top || !gitDir) {
    return [];
  }
  const common = resolve(gitDir, readText(join(gitDir, 'commondir'), '.').trim());
  const prefix = relative(top, root);
  return filesIn(join(common, 'worktrees'))
    .map((entry) => dirname(readText(join(entry, 'gitdir'), '').trim()))
    .filter((checkout) => checkout !== '.' && existsSync(join(checkout, prefix, WORKER_SCOPE)))
    .map((checkout) => join(checkout, prefix));
}

export function repositoryTop(from) {
  let directory = resolve(from);
  for (;;) {
    if (!isOwnFolder(directory)) {
      return undefined;
    }
    if (existsSync(join(directory, '.git'))) {
      return directory;
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
    directory = dirname(directory);
  }
}

export function commonDirOf(directory) {
  const gitDir = gitDirOf(directory);
  return gitDir && realOf(resolve(gitDir, readText(join(gitDir, 'commondir'), '.').trim()));
}
