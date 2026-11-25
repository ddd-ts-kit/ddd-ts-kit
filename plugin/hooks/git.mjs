// The guard's own runs of git: where it may run under the regulated profile, and how it is started so
// that nothing planted in a repository runs with it. Every mode but post-write reads it.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { call } from './call.mjs';
import { ANSWER_BYTES, isRegulated } from './project.mjs';
import { commonDirOf } from './repository.mjs';

// Said under the regulated profile of a project git is not run in.
const UNREAD_REPOSITORY =
  'This project lies outside the git repository of the session root: under the regulated profile the guard runs no git there, so it reads neither its uncommitted changes nor its branch.';
// What git answers where the guard does not run it: as a run that failed, with no output.
export const NOT_READ = { status: null, stdout: '', stderr: '' };

// The commands of git the guard runs that read the files of a checkout, and so would run git in each
// of its submodules.
const WORKTREE_READS = ['status', 'diff'];

// The common git directory of the repository of each session root found.
const repositories = new Map();

// The output of git split into its fields, none when git fails.
export function gitFields(checkout, args, separator) {
  return (git(checkout, args) ?? '').split(separator);
}

export function git(project, args) {
  const run = gitRun(project, args);
  return run.status === 0 ? run.stdout : undefined;
}

// Under the regulated profile, of the session root or of the place, git runs in the repository of the
// session root alone, never in a submodule of it: the sandbox of Claude Code denies its commands the
// config and the hooks of that repository only, and a filter or a diff driver of any other config,
// which a command can write, would run here outside the sandbox. Git has no switch that turns every
// driver off (docs/adr/0006-the-regulated-guard-runs-git-in-its-root-only.md).
export function gitRun(project, args) {
  if (!gitReads(project.root)) {
    return NOT_READ;
  }
  const [subcommand, ...rest] = args;
  const own = regulatedSession(project.root) && WORKTREE_READS.includes(subcommand);
  return spawnGit(project.root, own ? [subcommand, '--ignore-submodules=all', ...rest] : args);
}

function gitReads(directory) {
  return !regulatedSession(directory) || inSessionRepository(directory);
}

function regulatedSession(directory) {
  return isRegulated(sessionRoot()) || isRegulated(directory);
}

// The folder the session started in: Claude Code names it to its hooks, and its sandbox protects the
// git config there; another host sends its working directory.
function sessionRoot() {
  const cwd = typeof call.input.cwd === 'string' ? call.input.cwd : process.cwd();
  return resolve(process.env.CLAUDE_PROJECT_DIR || cwd);
}

// Whether `directory` is a checkout of the repository of the session root, its linked worktrees
// included, as their git files say: a nested repository, a submodule or a worktree of another
// repository has a common git directory of its own.
function inSessionRepository(directory) {
  const root = sessionRoot();
  if (!repositories.has(root)) {
    const top = spawnGit(root, ['rev-parse', '--show-toplevel']);
    repositories.set(root, top.status === 0 ? commonDirOf(top.stdout.trim()) : undefined);
  }
  const own = repositories.get(root);
  return own !== undefined && commonDirOf(directory) === own;
}

export function unreadRepositoryNotice(project) {
  return gitReads(project.root) ? [] : [UNREAD_REPOSITORY];
}

function spawnGit(directory, args) {
  // A core.fsmonitor planted in the config never runs on the guard's own git, nor does a hook planted
  // in the repository (the guard commits nothing), and its status writes no index.
  return spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '--no-optional-locks', ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: ANSWER_BYTES,
    },
  );
}
