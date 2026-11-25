// Which commands of a line only read: the programs the guard knows by their kind, a git invocation and
// whether it reads, the kit asked what it knows, and the commands that run code the guard cannot read.
// Read by pre-bash, where the reader of the shell is loaded (`call.shell`); pre-write and
// subagent-stop reach it with no command to read.
import { dirname } from 'node:path';
import { call } from './call.mjs';

// What a command may do with the lock or a verdict outside the judge: read it, or run the kit
// (`ddd-ts-kit` directly, or `npx ddd-ts-kit` seen through kitInvocations); `npx`/`pnpm` of anything
// else can write, and `git` reads only through the subcommands of GIT_READS.
export const READING_PROGRAMS = new Set(['cat', 'ls', 'head', 'tail', 'grep', 'wc', 'diff', 'jq', 'ddd-ts-kit']);
export const GIT_READS = new Set(['log', 'show', 'diff', 'status', 'add', 'commit', 'ls-files']);
// What touches no file: a command line moves to a worktree or checks a path before it reads or versions one.
export const NEUTRAL_PROGRAMS = new Set(['cd', 'pushd', 'popd', 'pwd', 'true', 'test', '[']);
// awk reads, unless its program comes from a file or may write (`print > "f"`, a pipe, `system`, `@include`).
export const AWK_PROGRAMS = new Set(['awk', 'gawk', 'mawk', 'nawk']);
// What a command may also do with the locked regression spec of a fix: run it, however the runner is launched.
export const RUNNING_PROGRAMS = new Set(['npm', 'yarn', 'bun', 'bunx', 'node', 'vitest', 'jest']);

// The subcommands of a package manager that install the lockfile as it is, its aliases included.
const CLEAN_INSTALLS = ['ci', 'clean-install', 'cin', 'ic', 'install-clean', 'isntall-clean'];

// The subcommands of each package manager that change package.json or the lockfile; an install
// changes them when it names a package.
export const DEPENDENCY_CHANGES = {
  npm: ['uninstall', 'un', 'unlink', 'remove', 'rm', 'r', 'update', 'up', 'upgrade', 'udpate'],
  pnpm: ['add', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade'],
  yarn: ['add', 'remove', 'upgrade', 'up', 'upgrade-interactive'],
  bun: ['add', 'a', 'remove', 'rm', 'update', 'upgrade'],
};
export const INSTALLS = ['install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall'];
// The options of a package manager that take a value: that value is not a package.
export const VALUED_MANAGER_OPTIONS = [
  '--prefix',
  '-C',
  '--dir',
  '-w',
  '--workspace',
  '--filter',
  '-F',
  '--registry',
  '--omit',
  '--include',
  '--loglevel',
  '--cache',
  '--tag',
  '--userconfig',
  '--cwd',
];

// How a command that runs tests can run other code: the code an interpreter is given inline (from
// its option, from `-` or from its standard input).
export const INLINE_CODE = {
  python: /^-[a-zA-Z]*c$/,
  node: /^(?:-[a-zA-Z]*[ep][a-zA-Z]*|--eval(?:=.*)?|--print(?:=.*)?)$/,
  bun: /^(?:-e|-p|--eval|--print)$/,
  ruby: /^-[a-zA-Z]*e[a-zA-Z]*$/,
  perl: /^-[a-zA-Z]*[eE][a-zA-Z]*$/,
  php: /^-r$/,
};
// The programs that run code the guard cannot read, whatever their arguments; a shell is one too.
export const CODE_RUNNERS = new Set([
  'node',
  'nodejs',
  'python',
  'perl',
  'ruby',
  'php',
  'bun',
  'bunx',
  'deno',
  'tsx',
  'ts-node',
  'source',
  '.',
  'make',
  'npm',
  'npx',
  'pnpm',
  'pnpx',
  'yarn',
  'vitest',
  'jest',
  'mocha',
  'ava',
  'tap',
  'playwright',
  'cypress',
  'stryker',
]);
// The programs that only read, whatever their arguments (not `rg --pre`, `sort -o`, `tree -o`): a
// worker's command made of them alone is not noted before it runs. Every other program may run code
// of the project (`noteBeforeCode`).
export const PURE_READERS = new Set([
  '',
  'cat',
  'ls',
  'head',
  'tail',
  'grep',
  'wc',
  'diff',
  'jq',
  'echo',
  'printf',
  'pwd',
  'cd',
  'pushd',
  'popd',
  'true',
  'false',
  'test',
  '[',
  'cut',
  'tr',
  'basename',
  'dirname',
  'realpath',
  'readlink',
  'stat',
  'file',
  'which',
  'find',
  'du',
  'date',
]);
// The subcommands of git that only read.
const GIT_READ_ONLY = new Set([
  'status',
  'log',
  'show',
  'diff',
  'ls-files',
  'ls-tree',
  'rev-parse',
  'blame',
  'grep',
  'describe',
  'cat-file',
  'merge-base',
  'rev-list',
  'shortlog',
]);
// The subcommands of git that change neither a tree nor a ref: a worker runs them from any checkout.
const GIT_READS_ANYWHERE = new Set([
  ...GIT_READ_ONLY,
  'config',
  'fetch',
  'ls-remote',
  'reflog',
  'for-each-ref',
  'show-ref',
  'show-branch',
  'symbolic-ref',
  'name-rev',
  'var',
  'version',
  'help',
  'check-ignore',
  'check-attr',
  'diff-tree',
  'diff-index',
  'diff-files',
  'count-objects',
  'cherry',
]);
// The first operands that make these subcommands of git read; none at all is undefined.
const GIT_READING_FORMS = {
  stash: ['list', 'show'],
  worktree: ['list'],
  remote: [undefined, 'show', 'get-url'],
  tag: [undefined],
};

// The options of `git branch` that delete, move, copy or reset a branch, and those that change its settings.
export const BRANCH_DELETES = ['-d', '-D', '--delete'];
export const BRANCH_MOVES = ['-m', '-M', '--move', '-c', '-C', '--copy'];
export const BRANCH_RESETS = ['-f', '--force'];
const BRANCH_SETTINGS = ['-u', '--set-upstream-to', '--unset-upstream', '--edit-description'];
// The options of `git branch` that list branches, an operand then being a pattern or a commit.
const BRANCH_LISTS = ['--list', '-l', '-a', '--all', '-r', '--remotes', '--show-current', '--contains', '--merged'];

export const SCRIPT_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

// The commands of the kit that write no file: what it lists, describes, explains and reports, its
// checks (`check` without `--baseline`, `lint` without `--fix`, `docs --check` without
// `--stored-events`, `affected` without `--run`), the acceptance read without `--lock`, a briefing,
// the place of a worker or a generator read without running it.
const KIT_READS = new Set([
  'list',
  'describe',
  'explain',
  'status',
  'stories',
  'story',
  'story-check',
  'todo',
  'check',
  'lint',
  'rules',
  'docs',
  'verify-merge',
  'cited',
  'affected',
]);
// The options by which a check of the kit writes: the baseline, a fix, the record of the stored events, a script run.
const KIT_WRITING_OPTIONS = /^--(?:baseline|fix|stored-events|run)(?:=|$)/;

// The options of a package runner or of node that take a value: that value launches nothing.
const LAUNCHER_VALUED = [
  '-r',
  '--require',
  '--import',
  '--loader',
  '-p',
  '--package',
  '-c',
  '--call',
  '-C',
  '--dir',
  '--prefix',
  '--filter',
  '-w',
  '--workspace',
];
// The folders of the programs of the system: a reader named by its path there is that reader.
const SYSTEM_PROGRAMS = ['/bin', '/usr/bin', '/sbin', '/usr/sbin'];

// A pure reader, git that reads (or versions in the worker's own worktree, which `workerGitReason`
// decides first), or the kit asked what it knows.
export function readsFromAnywhere(command) {
  if (call.shell.commandName(command.words) === 'git') {
    const { subcommand, tail } = gitInvocation(command.words.slice(1), command.directory);
    const plain = command.assigned.length === 0 && !command.words.some(runsAProgramOfGit);
    return plain && (readsAnywhere(subcommand, tail) || ['add', 'commit'].includes(subcommand));
  }
  return isPureReader(command) || kitInvocations([command]).some(kitReads);
}

export function kitReads({ subcommand, args }) {
  if (subcommand === 'acceptance') {
    return !args.includes('--lock');
  }
  if (['worker-scope', 'story-scope', 'generate', 'g'].includes(subcommand)) {
    return args.some((arg) => /^--(?:dry-run|resume|help)\b/.test(arg));
  }
  return (
    KIT_READS.has(subcommand) &&
    !args.some((arg) => KIT_WRITING_OPTIONS.test(arg)) &&
    (subcommand !== 'docs' || args.includes('--check'))
  );
}

// Options of `git` that take their value as the next word, and those of `git commit` that do.
export const GIT_VALUED_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
export const COMMIT_VALUED_OPTIONS = new Set([
  '-m',
  '-F',
  '-C',
  '-c',
  '-t',
  '--message',
  '--file',
  '--author',
  '--date',
]);

// Whether a word of `tail` gives one of the options, as git reads them: short ones bundled (`-fm`),
// long ones cut to a prefix (`--mov`).
export function hasBranchOption(tail, options) {
  return tail.some((word) =>
    options.some((option) =>
      option.startsWith('--')
        ? word.length > 2 && option.startsWith(word.split('=')[0])
        : /^-[a-zA-Z]+$/.test(word) && word.includes(option[1]),
    ),
  );
}

export function readsAnywhere(subcommand, tail) {
  if (subcommand === 'branch') {
    return listsBranches(tail);
  }
  if (subcommand in GIT_READING_FORMS) {
    return GIT_READING_FORMS[subcommand].includes(call.shell.operands(tail)[0]);
  }
  return subcommand === undefined || GIT_READS_ANYWHERE.has(subcommand);
}

// Each run of the CLI of the kit in `commands`, however it is launched: the `ddd-ts-kit` binary
// (`npx`, `npm exec`, `pnpm exec`, `bunx`, `node_modules/.bin`), the entry file of the CLI run by
// node (`.../cli/dist/bin.js`, `.../ddd-ts-kit/dist/bin.js`) or the kit script of a project.
export function kitInvocations(commands) {
  return commands.flatMap(({ words }) => {
    const at = launcherAt(words);
    if (at === -1) {
      return [];
    }
    const rest = words.slice(at + 1).filter((word) => word !== '--');
    // The value of `--cwd`, the option of the kit that comes before a subcommand, is none.
    const index = rest.findIndex((word, position) => !word.startsWith('-') && rest[position - 1] !== '--cwd');
    return index === -1 ? [] : [{ subcommand: rest[index], args: rest.slice(index + 1) }];
  });
}

// The launcher is the program, or the first operand of a package runner or of node without inline
// code: a word among the arguments of another program launches nothing.
function launcherAt(words) {
  if (words.length > 0 && isKitLauncher(words[0])) {
    return 0;
  }
  const name = call.shell.commandName(words);
  const skipped = SCRIPT_MANAGERS.includes(name) && ['exec', 'dlx', 'x'].includes(words[1]) ? 2 : 1;
  const runs = ['npx', 'pnpx', 'bunx', 'node', 'nodejs', 'pnpm', 'yarn'].includes(name) || skipped === 2;
  if (!runs || words.slice(1).some((word) => INLINE_CODE.node.test(word))) {
    return -1;
  }
  const [first] = call.shell.operands(words.slice(skipped), LAUNCHER_VALUED);
  const node = name === 'node' || name === 'nodejs';
  return first !== undefined && isKitLauncher(first) && (!node || first.includes('/'))
    ? words.indexOf(first, skipped)
    : -1;
}

function isKitLauncher(word) {
  const name = word.split('/').pop();
  return (
    /^ddd-ts-kit(?:@\S+)?$/.test(name) ||
    /(?:^|\/)(?:cli|ddd-ts-kit)\/dist\/bin\.[cm]?js$/.test(word) ||
    /(?:^|\/)scripts\/kit\.mjs$/.test(word)
  );
}

// The options before the subcommand of git; `-C <directory>` moves where its paths are read from.
export function gitInvocation(args, directory) {
  let index = 0;
  let moved = directory;
  while (index < args.length && args[index].startsWith('-')) {
    if (args[index] === '-C') {
      moved = call.shell.placeOf(args[index + 1] ?? call.shell.UNKNOWN, moved);
    } else if (/^--(?:git-dir|work-tree)\b/.test(args[index])) {
      moved = undefined;
    }
    index += GIT_VALUED_OPTIONS.has(args[index]) ? 2 : 1;
  }

  return { subcommand: args[index], tail: args.slice(index + 1), moved };
}

// A program that only reads, whatever its arguments, named by its name or by its path in a folder of
// the system (a program named `cat` elsewhere is another program), and git that only reads: without `--output`, which writes a file, nor a
// setting given to the command, nor an option that hands the files to a program (`grep -O`,
// `--ext-diff`). It runs no code of the project.
export function isPureReader({ words, assigned }) {
  const name = call.shell.commandName(words);
  if (words[0]?.includes('/') && !SYSTEM_PROGRAMS.includes(dirname(words[0]))) {
    return false;
  }
  if (name !== 'git') {
    return PURE_READERS.has(name);
  }
  const { subcommand, tail } = gitInvocation(words.slice(1));
  const reads = subcommand === 'branch' ? listsBranches(tail) : GIT_READ_ONLY.has(subcommand);
  return reads && assigned.length === 0 && !words.some(runsAProgramOfGit);
}

export function runsAProgramOfGit(word) {
  return word === '-c' || word === '-O' || /^(?:--output|--config-env|--ext-diff|--open-files-in-pager|-O.)/.test(word);
}

// `git branch` reads with no operand or when it lists, and with none of the options that write.
function listsBranches(tail) {
  const writes = [...BRANCH_DELETES, ...BRANCH_MOVES, ...BRANCH_RESETS, ...BRANCH_SETTINGS];
  return (
    !hasBranchOption(tail, writes) &&
    (call.shell.operands(tail).length === 0 || tail.some((word) => BRANCH_LISTS.includes(word)))
  );
}

// An install of the lockfile, in any spelling the guard knows (`npm ci`, `npm clean-install`, a bare
// `yarn`, `bun install --frozen-lockfile`): a worker's install of what the lockfile says is free.
export function installsPackages({ words }) {
  const manager = call.shell.commandName(words);
  const [subcommand] = call.shell.operands(words.slice(1), VALUED_MANAGER_OPTIONS);
  return (
    manager in DEPENDENCY_CHANGES &&
    (CLEAN_INSTALLS.includes(subcommand) || INSTALLS.includes(subcommand) || (manager === 'yarn' && !subcommand))
  );
}

// An interpreter, a shell, `source`, `make`, a package script or runner, a test runner, a program
// named by its path: code the guard cannot read. The kit's own CLI, behind a runner or not, is
// judged by what it is asked to do.
export function runsCode(command) {
  const name = call.shell.commandName(command.words);
  return (
    (CODE_RUNNERS.has(name) ||
      CODE_RUNNERS.has(name.replace(/[\d.]+$/, '')) ||
      call.shell.SHELLS.has(name) ||
      isProgramPath(command.words[0])) &&
    kitInvocations([command]).length === 0
  );
}

// A word that names a program by its path (`./scripts/seed.sh`, `node_modules/.bin/vitest`). A command
// with no word (a redirection alone) names none: read as text, its absent word is no path.
function isProgramPath(word) {
  const text = String(word);
  return /^\.{0,2}\//.test(text) || text.includes('node_modules/.bin/');
}
