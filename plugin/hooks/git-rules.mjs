// The rules on a git command: hooks skipped, a config that runs a program, the baseline written, where
// a worker may run git and what its git may move. Read by pre-bash.
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { call } from './call.mjs';
import { readJson, realOf } from './disk.mjs';
import { git, gitFields } from './git.mjs';
import { isSubAgent, isWorkerAgent } from './hook-input.mjs';
import { findProject } from './project.mjs';
import { hasWorkerWorktree, repositoryTop, WORKER_SCOPE } from './repository.mjs';
import { GIT_REF, named } from './said-as-data.mjs';
import {
  BRANCH_DELETES,
  BRANCH_MOVES,
  BRANCH_RESETS,
  COMMIT_VALUED_OPTIONS,
  GIT_VALUED_OPTIONS,
  gitInvocation,
  hasBranchOption,
  kitInvocations,
  readsAnywhere,
  SCRIPT_MANAGERS,
} from './shell-reads.mjs';
import { namedContext, readPin, REPORT_TO_CONDUCTOR, workerScope } from './worker-scope.mjs';
import { BASELINE_OWNER } from './write-rules.mjs';

// What a worker's git may name of the refs: the options of push, fetch, tag, checkout and switch
// that take a value, those of push that name other refs than its branch, those of tag that list,
// those of checkout and switch that create a branch or leave it.
const PUSH_VALUED = ['-o', '--push-option', '--repo', '--receive-pack', '--exec'];
const PUSH_OTHER_REFS =
  /^--(?:force|force-with-lease|force-if-includes|delete|all|branches|mirror|tags|follow-tags|prune)(?:=|$)/;
const FETCH_VALUED = [
  '-o',
  '--server-option',
  '--depth',
  '--deepen',
  '-j',
  '--jobs',
  '--upload-pack',
  '--refmap',
  '--filter',
  '--negotiation-tip',
];
const TAG_VALUED = ['-m', '--message', '-F', '--file', '-u', '--local-user', '--cleanup'];
const TAG_LISTS = /^(?:-l|--list|-v|--verify|--contains|--no-contains|--points-at|--merged|--no-merged)(?:=|$)/;
const SWITCH_VALUED = ['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan', '--conflict'];
const CHECKOUT_PATHS = /^(?:--ours|--theirs|-p|--patch|--pathspec-from-file(?:=.*)?)$/;
const SWITCH_CREATES = {
  checkout: /^(?:-[a-zA-Z]*[bB]|--orphan|--detach)$/,
  switch: /^(?:-[a-zA-Z]*[cCd]|--create|--force-create|--orphan|--detach)$/,
};

// The variables of the environment by which git runs a program or reads settings given to it.
const GIT_PROGRAM_VARIABLES =
  /^GIT_(?:EXTERNAL_DIFF|CONFIG\w*|PAGER|EDITOR|SEQUENCE_EDITOR|SSH\w*|ASKPASS|PROXY_COMMAND|EXEC_PATH)=/;

// The variables of lefthook that leave hooks or their commands out.
const HOOK_SELECTION = /^LEFTHOOK_(?:EXCLUDE|SKIP)=/;

const HOOKS_LOCAL_GATE =
  'the hooks of the project (pre-commit, commit-msg, pre-push) are the local gate of the pipeline: they run the checks before a change leaves the machine. An agent never skips them; fix what the hook reports instead. If the hook itself is broken, report it to the project owner, who can skip it in a terminal.';
const HOOK_ENVIRONMENT = /^(?:LEFTHOOK|HUSKY)=(?:0|false)$/;
const HOOK_SKIPPING_COMMANDS = new Set(['commit', 'push', 'merge', 'pull', 'rebase', 'am', 'cherry-pick', 'revert']);

// A git command that skips the hooks of the project: `--no-verify` (and `-n` on a commit),
// `-c core.hooksPath=...`, or `LEFTHOOK=0` / `HUSKY=0` set for the command.
export function hooksSkippedReason(commands) {
  const gits = commands.filter(({ words }) => call.shell.commandName(words) === 'git');
  if (gits.length === 0) {
    return undefined;
  }
  const variables = commands.flatMap(exportedVariables);
  if (variables.some((word) => HOOK_ENVIRONMENT.test(word))) {
    return `LEFTHOOK=0 or HUSKY=0 turns the hooks off for a git command: ${HOOKS_LOCAL_GATE}`;
  }
  if (variables.some((word) => HOOK_SELECTION.test(word))) {
    return `${variables.find((word) => HOOK_SELECTION.test(word)).split('=')[0]} skips hooks of the project: ${HOOKS_LOCAL_GATE}`;
  }
  if (variables.some((word) => /^GIT_CONFIG_(?:KEY_\d+|PARAMETERS)=.*core\.hookspath/i.test(word))) {
    return `a setting of core.hooksPath in the environment points git at other hooks: ${HOOKS_LOCAL_GATE}`;
  }
  for (const { words } of gits) {
    const skipped = hooksSkippedBy(words);
    if (skipped) {
      return `${skipped}: ${HOOKS_LOCAL_GATE}`;
    }
  }
  return undefined;
}

function hooksSkippedBy(words) {
  let index = 1;
  while (index < words.length && words[index].startsWith('-')) {
    if (optionPointsAtHooks(words[index], words[index + 1])) {
      return '`git -c core.hooksPath` points git at other hooks';
    }
    index += GIT_VALUED_OPTIONS.has(words[index]) ? 2 : 1;
  }
  return hooksSkippedBySubcommand(words[index], words.slice(index + 1));
}

function optionPointsAtHooks(word, next) {
  const configured = word === '-c' || word === '--config-env' ? next : /^--config-env=(.*)$/.exec(word)?.[1];
  return configured !== undefined && /^core\.hookspath\b/i.test(configured);
}

function hooksSkippedBySubcommand(subcommand, rest) {
  if (subcommand === 'config' && rest.some((word) => /^core\.hookspath$/i.test(word))) {
    return '`git config core.hooksPath` points git at other hooks';
  }
  if (subcommand === 'commit-tree') {
    return '`git commit-tree` makes a commit without the hooks';
  }
  if (!HOOK_SKIPPING_COMMANDS.has(subcommand)) {
    return undefined;
  }
  for (let position = 0; position < rest.length; position++) {
    const word = rest[position];
    if (word === '--') {
      return undefined;
    }
    if (word.startsWith('--no-ve') && '--no-verify'.startsWith(word)) {
      return `\`git ${subcommand} --no-verify\` skips the hooks`;
    }
    if (subcommand === 'commit' && COMMIT_VALUED_OPTIONS.has(word)) {
      position++;
    } else if (subcommand === 'commit' && /^-[^-mFCct]*n/.test(word)) {
      return '`git commit -n` is `--no-verify`, it skips the hooks';
    }
  }
  return undefined;
}

// Config keys a sub-agent must not set: each runs a command in every checkout of the repository
// (fsmonitor, pager, editor, sshCommand, hooksPath, an alias, a diff or filter driver, gpg).
// A sub-agent never deletes, moves or resets a branch checked out in another worktree of the
// repository: the branch of another worker, or the trunk of the conductor.
export function otherBranchReason(input, commands) {
  if (!isSubAgent(input)) {
    return undefined;
  }
  const cwd = input.cwd ?? process.cwd();
  for (const simple of commands) {
    const names = rewrittenBranches(simple.words);
    const taken =
      names.length > 0 ? names.find((name) => otherWorktreeBranches(simple.directory ?? cwd).has(name)) : undefined;
    if (taken) {
      return `A sub-agent never deletes, moves or resets the branch of another worktree: \`${taken}\` is checked out in another worktree of the repository. ${REPORT_TO_CONDUCTOR}`;
    }
  }
  return undefined;
}

// The branches `git branch` deletes, moves, copies (both names) or resets (the first operand).
function rewrittenBranches(words) {
  const { subcommand, tail } = gitInvocation(words.slice(1));
  if (call.shell.commandName(words) !== 'git' || subcommand !== 'branch') {
    return [];
  }
  const names = call.shell.operands(tail);
  if (hasBranchOption(tail, [...BRANCH_DELETES, ...BRANCH_MOVES])) {
    return names;
  }
  return hasBranchOption(tail, BRANCH_RESETS) ? names.slice(0, 1) : [];
}

// The branches checked out in the worktrees of the repository of `directory`, but its own.
function otherWorktreeBranches(directory) {
  const checkout = { root: directory };
  const own = git(checkout, ['rev-parse', '--show-toplevel'])?.trim();
  const blocks = gitFields(checkout, ['worktree', 'list', '--porcelain'], '\n\n');
  return new Set(
    blocks
      .filter((block) => block.split('\n')[0] !== `worktree ${own}`)
      .flatMap((block) => /^branch refs\/heads\/(.+)$/m.exec(block)?.slice(1) ?? []),
  );
}

const DANGEROUS_CONFIG = [
  /^core\.(?:fsmonitor|pager|editor|sshcommand|hookspath|attributesfile|gitproxy|askpass)$/i,
  /^alias\./i,
  /^diff\.external$/i,
  /^diff\..+\.(?:command|textconv)$/i,
  /^merge\..+\.driver$/i,
  /^filter\./i,
  /^gpg\.(?:.+\.)?program$/i,
  /^include(?:if\..+)?\.path$/i,
  /^credential\.(?:.+\.)?helper$/i,
  /^sequence\.editor$/i,
  /^interactive\.difffilter$/i,
  /^pager\./i,
  /^(?:merge|diff)tool\./i,
  /^protocol\./i,
  /^remote\..+\.(?:uploadpack|receivepack)$/i,
  /^uploadpack\.packobjectshook$/i,
];
const CONFIG_READS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list', '--list-all']);
const CONFIG_WRITES = new Set([
  '--unset',
  '--unset-all',
  '--remove-section',
  '--rename-section',
  '-e',
  '--edit',
  '--replace-all',
  '--add',
]);
// The verbs of `git config` (git 2.46), each with whether it changes the configuration.
const CONFIG_VERBS = new Map([
  ['get', false],
  ['list', false],
  ['get-color', false],
  ['get-colorbool', false],
  ['set', true],
  ['unset', true],
  ['edit', true],
  ['rename-section', true],
  ['remove-section', true],
]);

// A sub-agent never sets the git configuration (shared by every checkout of the repository) nor
// passes a dangerous `-c key=value`; it reads the config with `--get` or `--list`.
export function gitConfigReason(input, commands) {
  if (!isSubAgent(input)) {
    return undefined;
  }
  const variable = commands.flatMap(exportedVariables).find((word) => GIT_PROGRAM_VARIABLES.test(word));
  if (variable) {
    return `\`${variable.split('=')[0]}\` hands git a program or settings to run it: a sub-agent sets none. ${REPORT_TO_CONDUCTOR}`;
  }
  for (const { words } of commands.filter((simple) => call.shell.commandName(simple.words) === 'git')) {
    const reason = gitConfigKeyReason(words);
    if (reason) {
      return reason;
    }
  }
  return undefined;
}

// The variables a command sets for itself, and those `export`, `declare` or `typeset` set for the rest of the line.
export function exportedVariables({ words, assigned }) {
  return ['export', 'declare', 'typeset'].includes(call.shell.commandName(words)) ? [...assigned, ...words] : assigned;
}

function gitConfigKeyReason(words) {
  const inline = words
    .map((word, index) =>
      ['-c', '--config-env'].includes(words[index - 1]) ? word : /^--config-env=(.*)$/.exec(word)?.[1],
    )
    .find((setting) => setting !== undefined && isDangerousConfig(setting.split('=')[0]));
  if (inline) {
    const key = inline.split('=')[0];
    return `\`git -c ${key}\` runs a command in every checkout of the repository. ${REPORT_TO_CONDUCTOR}`;
  }
  const { subcommand, tail } = gitInvocation(words.slice(1), undefined);
  return subcommand === 'config' && setsConfig(tail)
    ? `\`git config\` changes the git configuration, shared by every checkout; a sub-agent reads it (\`--get\`, \`--list\`) but never sets it. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

function isDangerousConfig(key) {
  return DANGEROUS_CONFIG.some((pattern) => pattern.test(key));
}

// Decided by the verb (`git config get|list|set|unset|edit ...`, git 2.46) or the flag of the older
// form (`--get`, `--list`; `--unset`, `--add`, `--edit`, ...); without either, `<key> <value>` sets.
function setsConfig(tail) {
  if (tail.some((word) => CONFIG_WRITES.has(word))) {
    return true;
  }
  if (tail.some((word) => CONFIG_READS.has(word))) {
    return false;
  }
  const operands = call.shell.operands(tail, ['--type', '-t', '--file', '-f', '--default']);
  if (CONFIG_VERBS.has(operands[0])) {
    return CONFIG_VERBS.get(operands[0]);
  }
  return operands.length >= 2;
}

// However the kit is launched, a package script of the project included, read on the words of the command.
export function baselineWriteReason(project, commands) {
  const runs = [...commands, ...commands.flatMap((command) => scriptCommands(project, command))];
  return kitInvocations(runs).some(({ subcommand, args }) => subcommand === 'check' && writesBaseline(args))
    ? `check --baseline write records ddd-ts-kit-baseline.json: ${BASELINE_OWNER}`
    : undefined;
}

function writesBaseline(args) {
  return args.some(
    (word, index) => word === '--baseline=write' || (word === '--baseline' && args[index + 1] === 'write'),
  );
}

// What a package script runs, `npm run <script>` or `pnpm <script>`, with the words given after its name.
function scriptCommands(project, { words, directory }) {
  if (!SCRIPT_MANAGERS.includes(call.shell.commandName(words))) {
    return [];
  }
  const args = words.slice(1);
  const at = args.findIndex((word) => !word.startsWith('-') && !['run', 'run-script'].includes(word));
  const text = readJson(join(project.root, 'package.json'))?.scripts?.[args[at]];
  const given = args.slice(at + 1).filter((word) => word !== '--');
  return typeof text === 'string' ? call.shell.simpleCommands([text, ...given].join(' '), directory) : [];
}

// `worker-scope` adds a worktree and a branch: the conductor's to place, from the trunk. A sub-agent
// reads a briefing (`--dry-run`) or where a worker stands (`--resume`): both create nothing.
export function workerPlaceReason(input, commands) {
  if (!isSubAgent(input)) {
    return undefined;
  }
  const preparing = kitInvocations(commands).some(
    ({ subcommand, args }) =>
      (subcommand === 'worker-scope' && !args.some((arg) => /^--(?:dry-run|resume)\b/.test(arg))) ||
      (subcommand === 'story-scope' && !args.includes('--dry-run')),
  );
  return preparing
    ? 'Only the conductor prepares the place of a worker or of a story: `worker-scope` and `story-scope` add a git worktree and a branch. A sub-agent reads a briefing with `worker-scope <context> --dry-run`, or where a worker stands with `--resume`, which create nothing; if a worker is missing, report it to the conductor.'
    : undefined;
}

// `merge-trunk --to-land` gives the working migrations of a branch their real names just before its
// squash merge: the conductor's step. A sub-agent brings the trunk in with `merge-trunk` alone,
// however it launches the CLI.
export function landingReason(input, commands) {
  if (!isSubAgent(input)) {
    return undefined;
  }
  const landing = kitInvocations(commands).some(
    ({ subcommand, args }) => subcommand === 'merge-trunk' && args.includes('--to-land'),
  );
  return landing
    ? 'Only the conductor lands a branch: `merge-trunk --to-land` gives the working migrations their real names just before the squash merge. A worker brings the trunk in with `npx ddd-ts-kit merge-trunk` alone; report to the conductor that the branch is ready to land.'
    : undefined;
}

// A worker's git changes its own worktree: from any other checkout it only reads. The conductor lands
// a branch and moves its checkout, and a sibling's worktree and the refs of the repository are not a worker's.
export function workerGitReason(project, input, commands) {
  if (!isWorkerAgent(input)) {
    return undefined;
  }
  const own = ownWorktree(project, input);
  if (own === undefined && !hasWorkerWorktree(project.root)) {
    return undefined;
  }
  for (const { words, directory } of commands.filter((simple) => call.shell.commandName(simple.words) === 'git')) {
    const { subcommand, tail, moved } = gitInvocation(words.slice(1), directory);
    if (changesRepository(subcommand, tail)) {
      return `\`git ${subcommand}\`: the worktrees and the refs of the repository are the conductor's. ${REPORT_TO_CONDUCTOR}`;
    }
    if (!readsAnywhere(subcommand, tail) && unpinnedAmongSeveral(project, input)) {
      return `\`git ${subcommand}\`: this call names no worktree, and several workers have one in this repository. Run it as \`cd <worktree> && ...\`, with the worktree of your briefing.`;
    }
    if (!readsAnywhere(subcommand, tail) && !isOwnCheckout(own, moved)) {
      return `\`git ${subcommand}\` runs in ${moved ?? 'a place only the shell knows'}, not in your worktree: only the conductor lands a branch or moves its checkout. Run it as \`cd <worktree> && ...\`, and report to the conductor that the branch is ready.`;
    }
    const branch = () => workerBranch(own ?? findProject(moved).root, workerScope(project, input));
    if (leavesOwnBranch(subcommand, tail, { moved, branch })) {
      const where = branch() === undefined ? 'its own branch' : `its branch \`${branch()}\``;
      return `\`git ${subcommand}\`: a worker's git keeps to ${where}: it pushes that branch alone, without force nor deletion, fetches into no ref, makes no tag, and checks out no other branch nor creates one; the trunk and the other refs are the conductor's. ${REPORT_TO_CONDUCTOR}`;
    }
  }
  return undefined;
}

// A worker no call has pinned yet, in a checkout that holds a scope: where another checkout holds one
// too, the one its command stands in is not known to be its own.
function unpinnedAmongSeveral(project, input) {
  return namedContext(project) !== undefined && workerScope(project, input) === undefined;
}

// The branch of a worker: the one its scope file recorded at the pin, or records before any pin,
// else the one its worktree has checked out.
function workerBranch(root, scope) {
  const recorded = scope?.branch ?? named(readJson(join(root, WORKER_SCOPE))?.branch, GIT_REF);
  return recorded ?? named(git({ root }, ['symbolic-ref', '--quiet', '--short', 'HEAD'])?.trim(), GIT_REF);
}

// A push of another ref than the worker's branch, forced or deleting; a fetch into a ref; a tag; a
// checkout or a switch to another branch, a new one or none. `branch` is read only when a ref is named.
function leavesOwnBranch(subcommand, tail, { moved, branch }) {
  if (subcommand === 'fetch') {
    return call.shell
      .operands(tail, FETCH_VALUED)
      .slice(1)
      .some((spec) => spec.includes(':'));
  }
  if (subcommand === 'tag') {
    return call.shell.operands(tail, TAG_VALUED).length > 0 && !tail.some((word) => TAG_LISTS.test(word));
  }
  if (subcommand === 'push') {
    return (
      tail.some((word) => PUSH_OTHER_REFS.test(word) || /^-[a-zA-Z46]*[fd]/.test(word)) ||
      call.shell
        .operands(tail, PUSH_VALUED)
        .slice(1)
        .some((spec) => !pushesOwnBranch(spec, branch))
    );
  }
  if (subcommand === 'checkout' || subcommand === 'switch') {
    const target = switchTarget(subcommand, tail, moved);
    return (
      tail.some((word) => SWITCH_CREATES[subcommand].test(word)) ||
      (target !== undefined && ![branch(), `refs/heads/${branch()}`].includes(target))
    );
  }
  return false;
}

// A refspec of a push that names the worker's branch as its destination, or the current branch alone.
function pushesOwnBranch(spec, branch) {
  const [source, destination] = spec.split(':');
  if (spec.startsWith('+') || source === '') {
    return false;
  }
  const target = destination ?? source;
  return (
    (destination === undefined && ['HEAD', '@'].includes(target)) ||
    [branch(), `refs/heads/${branch()}`].includes(target)
  );
}

// The branch a checkout or a switch moves to: for a checkout, its one operand that names no file of
// the tree, unless an option gives paths (`--ours`, `--theirs`, `--patch`, `--pathspec-from-file`).
function switchTarget(subcommand, tail, moved) {
  const named = call.shell.operands(tail, SWITCH_VALUED);
  if (subcommand === 'switch') {
    return named[0];
  }
  const paths = tail.includes('--') || tail.some((word) => CHECKOUT_PATHS.test(word));
  return paths || named.length !== 1 || existsSync(resolve(moved, named[0])) ? undefined : named[0];
}

// The worktree a worker is pinned to, or the one its command stands in, before its first call is over.
function ownWorktree(project, input) {
  const { pinned } = readPin(project, input);
  if (pinned) {
    return pinned.worktree;
  }
  return namedContext(project) ? realpathSync(project.root) : undefined;
}

// Whether git runs in the worktree of the worker, under any folder of it; a worker not pinned yet
// has every checkout that holds a scope.
function isOwnCheckout(own, place) {
  if (place === undefined) {
    return false;
  }
  if (own !== undefined) {
    return repositoryTop(realOf(place)) === repositoryTop(own);
  }
  const checkout = findProject(place);
  return checkout !== undefined && namedContext(checkout) !== undefined;
}

function changesRepository(subcommand, tail) {
  return (
    subcommand === 'update-ref' ||
    (subcommand === 'worktree' && ['remove', 'move', 'prune', 'lock', 'unlock', 'repair'].includes(tail[0])) ||
    (subcommand === 'symbolic-ref' &&
      (call.shell.operands(tail).length > 1 || tail.some((word) => /^(?:-d|--delete)$/.test(word))))
  );
}
