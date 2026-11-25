// What a worker's command changed outside its scope: the state noted before code the guard cannot
// read, compared at the next call, held until it is put back. Read by pre-write, pre-bash and
// subagent-stop.
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { call } from './call.mjs';
import { isRecord, readBounded, readJson } from './disk.mjs';
import { git, gitFields, gitRun, NOT_READ } from './git.mjs';
import { GUARD_HELD, stateFile, writeState } from './guard-state.mjs';
import { removeKitFile, writeKitFile } from './kit-files.mjs';
import { findProject, FORMATTED_FILE, installedBin, projectPath } from './project.mjs';
import { STORY_SCOPE, WORKER_SCOPE } from './repository.mjs';
import { COMMIT_ID } from './said-as-data.mjs';
import {
  COMMIT_VALUED_OPTIONS,
  gitInvocation,
  installsPackages,
  isPureReader,
  kitInvocations,
  NEUTRAL_PROGRAMS,
  runsCode,
  SCRIPT_MANAGERS,
  VALUED_MANAGER_OPTIONS,
} from './shell-reads.mjs';
import { changedPaths, writtenTargets } from './shell-writes.mjs';
import { contextScopeReason, DECISION_RECORD, REPORT_TO_CONDUCTOR, workerScope } from './worker-scope.mjs';
import { generatedFileReason } from './write-rules.mjs';

// The merged sides a path is compared with, newest first.
const COMPARED_SIDES = 16;

// What `npm run regenerate` rewrites outside every context (the CLI's `isDerived`): the contracts
// and the documents derived from them, the clients of an SDK, the pages of what the tests state,
// the context map and the dependency rules. A worker runs it through `verify-slice`.
const REGENERATED_FILES =
  /^(?:openapi|docs\/integration|docs\/behaviour|clients)\/|^docs\/context-map\.md$|^\.dependency-cruiser\.cjs$/;

// What the guard stands on in a checkout: its config, and the settings, hooks and plugins of the hosts.
const GUARD_GROUND = [
  /^ddd-ts-kit\.config\.json$/,
  /^\.claude\//,
  /^\.claude-plugin\//,
  /^\.codex\//,
  /^\.agents\//,
  /^\.github\/(?:hooks|copilot)\//,
];

const UNCOMPARED_COMMITS =
  'The guard could not compare what your last command committed with the state it noted before it: git did not answer for the commits between them (one of them is gone from the repository, or git took too long). Nothing is taken as unchanged, and every call is held until git answers: report to the conductor.';
const UNCOMPARED_NOTE =
  'ddd-ts-kit: `git status` did not answer in full, so what your last command changed outside your scope was not compared. Name it in your report, for the conductor.';

// The scripts of a project that rewrite files by its own tools, which `init` writes and the skills name.
const SANCTIONED_SCRIPTS = new Set([
  'format',
  'lint:fix',
  'regenerate',
  'docs:generate',
  'openapi:generate',
  'events:generate',
]);

// The packages whose bin the guard runs, by name and command.
const GUARD_RUNS = [
  ['ddd-ts-kit', 'ddd-ts-kit'],
  ['@biomejs/biome', 'biome'],
];

// How a run stopped before its answer ended fails: past ANSWER_BYTES, or past its time limit.
const CUT_SHORT = new Set(['ENOBUFS', 'ETIMEDOUT']);

// The fields before the path in an entry of `git status --porcelain=v2`, by its kind.
const STATUS_FIELDS = { 1: 8, 2: 9, u: 10, '?': 1 };

// What the guard reads of one file to compare it, and copies to hold it, within the 5 s of its hook.
const HASHED_FILE_BYTES = 16 * 1024 * 1024;

// What the branch of a worker holds outside its scope since the base its scope file recorded when
// the worker was pinned: its commits since then, what the trunk brought in left out, and what stays
// uncommitted. A scope file that records no base leaves the commits uncompared, as the guard fails open.
export function branchOutsideReason(project, input) {
  const base = workerScope(project, input).baseCommit;
  if (!base) {
    return undefined;
  }
  const outside = worktreeOutside(project, input);
  const committed = committedSince(project, { from: base, trunks: trunkTips(project, input) }, outside);
  if (committed === undefined) {
    return `The guard could not compare your branch with its base ${base.slice(0, 12)}: git did not answer for the commits between them. Name it in your report for the conductor.`;
  }
  const paths = [...committed.keys(), ...Object.keys(snapshot(project, outside).changes)];
  return paths.length === 0
    ? undefined
    : `Your branch holds files outside your scope since its base ${base.slice(0, 12)}: ${[...new Set(paths)].join(', ')}. Take them out of your branch (\`git checkout ${base.slice(0, 12)} -- <path>\` or \`git rm\` for a new file, then \`git commit\`), or name them in your report for the conductor. ${REPORT_TO_CONDUCTOR}`;
}

// The code a worker's command runs (inline code, a script, a shell fed on its input, a test or a
// package script) cannot be read in advance: unless every command of the line is a pure reader, the
// state outside the scope is noted before it, and compared at the next call of the guard by that
// worker (`settleNote`). The kit's own merge of the trunk, which brings the trunk's files in, is not
// noted; nor are the packages around an install, which rewrites them.
export function noteBeforeCode(project, input, commands) {
  const { base } = workerScope(project, input);
  if (commands.every((command) => isPureReader(command) || startsTrunkMerge(command, base))) {
    return;
  }
  const session = sessionCheckout(project, input);
  writeState(stateFile('before-run', project, input), {
    trunks: trunkTips(project, input),
    worktree: snapshot(project, worktreeOutside(project, input), join(project.root, GUARD_HELD)),
    session: session && { ...snapshot(session, sessionOutside), root: session.root, scopes: scopeStates(session) },
    // The kit's merge installs the packages itself when the lockfile changed, as an install does.
    packages: commands.some((command) => installsPackages(command) || mergesWithTheKit(command))
      ? undefined
      : packageStates(project, session),
    script: sanctionedScripts(commands),
  });
}

// The scripts of the project its own tools run in (Biome, ESLint, the generators of the kit), when
// they are all the code of the line: what they rewrite outside the scope is said, not held.
function sanctionedScripts(commands) {
  const scripts = commands.filter((command) => !isPureReader(command)).map(scriptRun);
  return scripts.every(Boolean) ? scripts.join('`, `') : undefined;
}

// `npm run <script>`, `pnpm <script>`, `yarn run <script>`... of a sanctioned script, as `<manager> run <script>`.
// A script run in another folder (`--prefix`, `-C`, `--dir`, `--filter`) is no tool of this project.
function scriptRun({ words }) {
  const manager = call.shell.commandName(words);
  if (words.some((word) => /^(?:--prefix|-C|--dir|--filter|-F|-w|--workspace)(?:=|$)/.test(word))) {
    return undefined;
  }
  const [first, second] = call.shell.operands(words.slice(1), VALUED_MANAGER_OPTIONS);
  const script = ['run', 'run-script'].includes(first) ? second : manager === 'npm' ? undefined : first;
  return SCRIPT_MANAGERS.includes(manager) && SANCTIONED_SCRIPTS.has(script) ? `${manager} run ${script}` : undefined;
}

// The kit's merge of the trunk of the worker: the one it finds by itself, or the base the scope
// file recorded, named by `--trunk`. Asked for any other ref, it is a merge as another.
function startsTrunkMerge(command, base) {
  return kitInvocations([command]).some(
    ({ subcommand, args }) =>
      subcommand === 'merge-trunk' && !args.includes('--continue') && namesNoOtherTrunk(args, base),
  );
}

// Every `--trunk` of the command names the base, spaced or joined: given twice the CLI takes the
// last, and a form with no value, or an option that only starts like it, is none the guard reads.
function mergesWithTheKit(command) {
  return kitInvocations([command]).some(({ subcommand }) => subcommand === 'merge-trunk');
}

function namesNoOtherTrunk(args, base) {
  return args.every((arg, index) => {
    if (!arg.startsWith('--trunk')) {
      return true;
    }
    const trunk =
      arg === '--trunk' ? args[index + 1] : arg.startsWith('--trunk=') ? arg.slice('--trunk='.length) : undefined;
    return trunk !== undefined && trunk === base;
  });
}

// The checkout of the session, when it is not the worker's: every file of it is outside the scope.
function sessionCheckout(project, input) {
  const home = findProject(input.cwd ?? process.cwd());
  return home?.root === project.root ? undefined : home;
}

function sessionOutside(path) {
  return !/^\.(?:ddd-ts-kit|worktrees)\//.test(path);
}

// The paths of the worktree outside the scope; generated files are left out: a generator rewrites
// them, and so does `regenerate`, which `verify-slice` runs in the worktree of a worker. A decision
// record a commit adds (`letter` A) is the worker's own.
function worktreeOutside(project, input) {
  const { context } = workerScope(project, input);
  return (path, letter) =>
    !path.startsWith('.ddd-ts-kit/') &&
    !(letter === 'A' && DECISION_RECORD.test(path)) &&
    contextScopeReason(project, path, context) !== undefined &&
    !generatedFileReason(project, join(project.root, path)) &&
    !REGENERATED_FILES.test(path);
}

// The files the guard itself runs, in the worktree and the session's checkout: the manifest and the
// bin of the kit's CLI and of Biome, each by its time and size ('absent' when missing). Under the
// regulated profile it runs none.
function packageStates(project, session) {
  const states = {};
  for (const root of [project.root, session?.root].filter(Boolean)) {
    for (const [name, command] of project.regulated ? [] : GUARD_RUNS) {
      const home = join(root, 'node_modules', name);
      for (const file of [join(home, 'package.json'), installedBin(home, name, command)?.bin].filter(Boolean)) {
        const stat = statSync(file, { throwIfNoEntry: false });
        states[file] = stat ? `${stat.mtimeMs}:${stat.size}` : 'absent';
      }
    }
  }
  return states;
}

// The state outside the scope in a checkout: its HEAD, and each file git shows changed from it that
// `outside` keeps, with the hash of its content (null once deleted), whether git tracks it, whether
// it is added to the index, and the path a rename (`git mv`) came from. With `keep`, the content of
// each changed file is kept there under its hash, so that it can be put back.
function snapshot(checkout, outside, keep) {
  const status = gitRun(checkout, ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all']);
  const state = { head: undefined, changes: {} };
  if (CUT_SHORT.has(status.error?.code)) {
    return { ...state, unread: true };
  }
  const fields = (status.status === 0 ? status.stdout : '').split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const { head, path, from, ...flags } = statusEntry(fields[index], fields[index + 1]);
    index += from === undefined ? 0 : 1;
    state.head ??= head;
    for (const [changed, entry] of [
      [path, { ...flags, from }],
      [from, {}],
    ]) {
      if (changed !== undefined && outside(changed)) {
        state.changes[changed] = { hash: contentHash(join(checkout.root, changed), keep), ...entry };
      }
    }
  }
  return state;
}

// One entry of `git status --porcelain=v2 -z`: the HEAD of its header, else a path (after a fixed
// number of fields by kind), and for a rename the path it came from, the next field.
function statusEntry(field, next) {
  if (field.startsWith('# branch.oid ')) {
    return { head: field.slice('# branch.oid '.length) };
  }
  const skipped = STATUS_FIELDS[field[0]];
  if (skipped === undefined) {
    return {};
  }
  const parts = field.split(' ');
  return {
    path: parts.slice(skipped).join(' '),
    untracked: field[0] === '?',
    added: field[0] === '1' && parts[1][0] === 'A',
    from: field[0] === '2' ? next : undefined,
  };
}

// What changed outside the scope stops the worker until it is put back; the commands that put back
// exactly those files (and a commit that records it) stay allowed. A refusal said once comes first.
export function pendingChangeReason(project, input, commands) {
  const told = settleNote(project, input, commands.every(isPureReader));
  return told ? { reason: told } : heldChangeReason(project, input, commands);
}

// The note before the last command, compared now: what changed outside the scope in the worktree is
// held until it is put back (`heldChangeReason`); what changed in the packages the guard runs is
// refused once; a file left changed in the session's checkout is said once and refuses nothing: it
// is written already, the worker puts nothing back there, and the conductor, who edits its plan
// while workers run, alone knows whether it changed it.
// A process the last command left in the background goes on changing files: when nothing changed and
// the call only reads (`reading`), the note of the worktree stays for the next call, until a change, a
// stop or a new note ends it.
export function settleNote(project, input, reading) {
  const noted = stateFile('before-run', project, input);
  const before = readJson(noted);
  if (!isRecord(before?.worktree)) {
    return undefined;
  }
  const session = notedSession(before.session);
  const settled = holdChanges(project, input, before);
  if (settled === UNCOMPARED_COMMITS) {
    // The note stays: it is compared again once git answers.
    return UNCOMPARED_COMMITS;
  }
  const { said, ground } = session ? sessionChanges(session, before.session) : {};
  const told = ground ?? packagesChangeReason(before.packages, project, session);
  if (said) {
    call.notice = [call.notice, said].filter(Boolean).join('\n');
  }
  if (reading && !settled && !told && !said) {
    writeState(noted, { worktree: before.worktree, script: before.script, trunks: before.trunks });
  } else {
    removeKitFile(noted);
  }
  return told;
}

// Whether the note is settled: something changed outside the scope since it, or it cannot be compared.
// A status that did not answer in full, on either side, compares nothing, and that is said once.
function holdChanges(project, input, { worktree: before, script, trunks: noted }) {
  const trunks = notedTrunks(project, input, noted);
  const outside = worktreeOutside(project, input);
  const now = snapshot(project, outside);
  if (before.unread || now.unread) {
    call.notice = [call.notice, UNCOMPARED_NOTE].filter(Boolean).join('\n');
    return true;
  }
  const all = differences(project, outside, { before, now, trunks });
  if (all === undefined) {
    return UNCOMPARED_COMMITS;
  }
  const rewritten = script ? all.filter(isRewrittenByTools) : [];
  const uncopied = all.filter((path) => !rewritten.includes(path) && hasNoCopy(project, before.changes[path]));
  const changed = all.filter((path) => !rewritten.includes(path) && !uncopied.includes(path));
  if (rewritten.length > 0) {
    call.notice = [call.notice, rewrittenNotice(script, rewritten)].filter(Boolean).join('\n');
  }
  if (uncopied.length > 0) {
    call.notice = [call.notice, uncopiedNotice(uncopied)].filter(Boolean).join('\n');
  }
  if (changed.length > 0) {
    const file = stateFile('outside', project, input);
    const held = readJson(file) ?? {};
    for (const path of changed) {
      held[path] ??= { ...(before.changes[path] ?? { clean: true }), head: before.head, trunks };
    }
    writeState(file, held);
  }
  return all.length > 0;
}

// What Biome, ESLint and the generators of the kit rewrite: code, JSON and the documents.
function isRewrittenByTools(path) {
  return FORMATTED_FILE.test(path) || path.startsWith('docs/');
}

// A file already changed before the command is held to the copy the note kept: there is none of a
// file past the bound, or of one the guard cannot read, so it cannot be put back, and is said instead.
function hasNoCopy(project, entry) {
  return Boolean(entry?.hash) && !existsSync(join(project.root, GUARD_HELD, entry.hash));
}

function uncopiedNotice(paths) {
  return `ddd-ts-kit: your last command left files changed outside your scope, and already changed before it: ${paths.join(', ')}. They are not held: the guard keeps no copy of a file past ${HASHED_FILE_BYTES / (1024 * 1024)} MiB, which it compares by its size and time, nor of one it cannot read. Leave them out of your commits and name them in your report, for the conductor.`;
}

function rewrittenNotice(script, paths) {
  return `ddd-ts-kit: \`${script}\` rewrote files outside your scope: ${paths.join(', ')}. They are not held: the project's own tool rewrote them. Leave them out of your commits and name them in your report, for the conductor.`;
}

// The paths whose content differs between two snapshots: changed in either, or, when HEAD moved,
// changed by the commits between them (a commit, an amend, a reset), the files of the trunk a merge
// brings in compared by their content.
function differences(checkout, outside, { before, now, trunks }) {
  const committed =
    now.head === before.head ? new Map() : committedSince(checkout, { from: before.head, trunks }, outside);
  if (committed === undefined) {
    return undefined;
  }
  const paths = new Set([...Object.keys(before.changes), ...Object.keys(now.changes), ...committed.keys()]);
  return [...paths].filter((path) => {
    const was = before.changes[path];
    const content = was
      ? was.hash !== (now.changes[path]?.hash ?? contentHash(join(checkout.root, path)))
      : path in now.changes;
    return committed.has(path) || content;
  });
}

// The paths `outside` keeps that differ between the commit `from` and HEAD, each with its letter
// (A added, M modified, D deleted); a path that HEAD holds as the other side of a merge since then
// (the trunk `merge-trunk` brought in) is the trunk's, not a change of the worker. `trunks` are the
// commits the trunks named when the comparison starts.
function committedSince(checkout, { from, trunks }, outside) {
  if (!COMMIT_ID.test(from)) {
    // A repository without a commit yet: the files git shows are all there is to compare.
    return new Map();
  }
  const listed = gitRun(checkout, ['diff', '--name-status', '--no-renames', '-z', '--end-of-options', from, 'HEAD']);
  if (listed !== NOT_READ && listed.status !== 0) {
    // Git could not compare the two commits (one of them is gone, or it did not answer in time).
    return undefined;
  }
  const fields = listed.stdout.split('\0');
  const paths = new Map();
  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (outside(fields[index + 1], fields[index])) {
      paths.set(fields[index + 1], fields[index]);
    }
  }
  const kept = [...paths.keys()];
  const brought =
    trunks.length === 0
      ? broughtIn(checkout, allMergedSides(checkout, from), kept)
      : heldAsTheTrunk(checkout, trunks, kept);
  for (const path of brought) {
    paths.delete(path);
  }
  return paths;
}

// Those of `paths` that HEAD holds as the trunk does, as far as the branch merged it: for each
// trunk, the commit of it that HEAD contains (their merge base). A path is the trunk's when HEAD
// holds it as that commit does; what that commit holds and HEAD lacks or changes is a change of the
// branch, whatever earlier commit of the trunk a merge named as its other side, and so is what a
// commit no trunk held brought in. A trunk git cannot compare excuses nothing.
function heldAsTheTrunk(checkout, trunks, paths) {
  const brought = new Set();
  for (const trunk of trunks) {
    const merged = git(checkout, ['merge-base', 'HEAD', trunk])?.trim();
    const differing = merged ? gitRun(checkout, ['diff', '--name-only', '-z', merged, 'HEAD']) : NOT_READ;
    const apart = new Set(differing.stdout.split('\0'));
    for (const path of differing.status === 0 ? paths.filter((kept) => !apart.has(kept)) : []) {
      brought.add(path);
    }
  }
  return brought;
}

// Those of `paths` that HEAD holds as one of `sides` does: a merge brought them in whole. Without a
// trunk apart from the branch checked out, every side is taken as the trunk's.
function broughtIn(checkout, sides, paths) {
  const brought = new Set();
  // The newest sides: a trunk merged again holds what its earlier merges brought in.
  for (const side of sides.slice(0, COMPARED_SIDES)) {
    const differing = new Set(gitFields(checkout, ['diff', '--name-only', '-z', side, 'HEAD'], '\0'));
    for (const path of paths.filter((kept) => !differing.has(kept))) {
      brought.add(path);
    }
  }
  return brought;
}

// The commits the trunks of a worker name now: the base its scope file recorded at the pin (the
// trunk of the repository, or the integration branch its worktree was cut from), the branch
// origin/HEAD names, main and master. A trunk is a branch of the repository, local or of a remote,
// that is neither the branch checked out nor the worker's own: HEAD, a tag, a commit or another
// spelling of its branch is none.
function trunkTips(project, input) {
  const scope = workerScope(project, input);
  const own = [
    git(project, ['symbolic-ref', '--quiet', 'HEAD'])?.trim(),
    ...(scope.branch ? [`refs/heads/${scope.branch}`] : []),
  ];
  const tips = [...(scope.base ? [scope.base] : []), 'refs/remotes/origin/HEAD', 'refs/heads/main', 'refs/heads/master']
    .map((name) => git(project, ['rev-parse', '--verify', '--quiet', '--symbolic-full-name', name])?.trim())
    .filter((ref) => /^refs\/(?:heads|remotes)\//.test(ref ?? '') && !own.includes(ref))
    .map((ref) => git(project, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim())
    .filter(Boolean);
  return [...new Set(tips)];
}

// The trunks a note recorded before the command it was taken for; a note of an earlier version of
// the guard recorded none, and is compared with the trunks as they stand.
function notedTrunks(project, input, noted) {
  return Array.isArray(noted) ? noted : trunkTips(project, input);
}

function allMergedSides(checkout, from) {
  return gitFields(
    checkout,
    ['rev-list', '--first-parent', '--merges', '--parents', '--end-of-options', `${from}..HEAD`],
    '\n',
  )
    .filter(Boolean)
    .flatMap((line) => line.split(' ').slice(2));
}

// The checkout of the session the note was taken for: the next call may start in another one, and
// is still compared with that one.
function notedSession(before) {
  return isRecord(before) && typeof before.root === 'string' ? { root: before.root } : undefined;
}

// The scope files of a checkout, which git ignores, by their content.
function scopeStates(checkout) {
  return Object.fromEntries([WORKER_SCOPE, STORY_SCOPE].map((path) => [path, contentHash(join(checkout.root, path))]));
}

// What the conductor commits or merges in its checkout meanwhile is its own: only the files left
// changed in its working tree, and changed since the note, can be the worker's. An ordinary file is
// `said`, a notice; the `ground` of the guard there (its config, the settings and the hooks of the
// hosts, a scope file) is a refusal, since a change of it changes what the guard holds next.
function sessionChanges(session, before) {
  if (before.unread) {
    return {};
  }
  const now = snapshot(session, sessionOutside).changes;
  const changed = Object.keys(now).filter((path) => before.changes[path]?.hash !== now[path].hash);
  const scopes = scopeStates(session);
  const ground = [
    ...changed.filter((path) => GUARD_GROUND.some((pattern) => pattern.test(path))),
    ...Object.keys(scopes).filter((path) => before.scopes[path] !== scopes[path]),
  ];
  const plain = changed.filter((path) => !ground.includes(path));
  return {
    said:
      plain.length === 0
        ? undefined
        : `ddd-ts-kit: files of the checkout of the session, ${session.root}, changed while your last command ran: ${plain.join(', ')}. A worker never changes another checkout: put nothing back there yourself, and name them in your report for the conductor, who knows whether it changed them.`,
    ground:
      ground.length === 0
        ? undefined
        : `The ground of the guard in the checkout of the session, ${session.root}, changed while your last command ran: ${ground.join(', ')}. A worker never changes the config of the kit, the settings or the hooks of a coding agent, nor a scope file: put nothing back there yourself, and report it to the conductor, who knows whether it changed them. ${REPORT_TO_CONDUCTOR}`,
  };
}

// A package file that appears, changes or disappears since the note is a change, in the worktree
// and in the checkout of the session the note was taken for.
function packagesChangeReason(before, project, session) {
  if (!isRecord(before)) {
    return undefined;
  }
  const now = packageStates(project, session);
  const changed = Object.keys({ ...before, ...now }).filter((file) => before[file] !== now[file]);
  return changed.length === 0
    ? undefined
    : `The packages the guard runs changed while your last command ran: ${changed.join(', ')}. A worker never changes node_modules: report it to the conductor, who installs them again. ${REPORT_TO_CONDUCTOR}`;
}

export function heldChangeReason(project, input, commands) {
  const recorded = stateFile('outside', project, input);
  const held = readJson(recorded);
  if (!isRecord(held)) {
    return undefined;
  }
  const now = snapshot(project, worktreeOutside(project, input));
  if (now.unread) {
    return undefined;
  }
  const noted = new Map(Object.values(held).map((target) => [target.head, target.trunks]));
  const since = { commits: new Map(), trunks: (head) => notedTrunks(project, input, noted.get(head)) };
  const left = Object.entries(held).filter((entry) => !isPutBack(project, { now, since }, entry));
  if (left.length === 0) {
    removeKitFile(recorded);
    return undefined;
  }
  const paths = new Set(left.map(([path]) => path));
  const acting = commands.filter(({ words }) => !NEUTRAL_PROGRAMS.has(call.shell.commandName(words)));
  const restoring = (command) => isGitCommit(command) && recordsRestoration(project, input, { now, since, left });
  if (acting.length > 0 && acting.every((command) => putsBack(project, command, paths) || restoring(command))) {
    return { undoing: true };
  }

  return { reason: putBackReason(project, { now, since }, left) };
}

// A file held to its content (null: deleted) is back once it has it; a file held to a commit is
// back once git shows it unchanged and no commit since changed it.
function isPutBack(project, { now, since }, [path, target]) {
  const content = 'clean' in target ? !(path in now.changes) : contentHash(join(project.root, path)) === target.hash;
  return content && !(target.head !== now.head && commitsOf(project, since, target.head).has(path));
}

function commitsOf(project, since, from) {
  if (!since.commits.has(from)) {
    // Commits git cannot compare are taken to have changed every held file: none is back yet.
    const committed = committedSince(project, { from, trunks: since.trunks(from) }, () => true);
    since.commits.set(from, committed ?? { has: () => true, get: () => 'M' });
  }
  return since.commits.get(from);
}

// A command that only puts back some of `paths` (`git checkout HEAD --`, `git mv` back, `cp` of the
// held content, `rm` of a new file), or the commit that records it.
function putsBack(project, command, paths) {
  const touched = [...changedPaths(command), ...writtenTargets(command)];
  return (
    touched.every(({ place }) => place !== undefined && paths.has(projectPath(project, place))) &&
    !runsCode(command) &&
    touched.length > 0
  );
}

// A plain `git commit`: no `-a`, no paths of its own, so that it records the index alone.
function isGitCommit(command) {
  const { subcommand, tail } = gitInvocation(command.words.slice(1));
  return (
    call.shell.commandName(command.words) === 'git' &&
    subcommand === 'commit' &&
    changedPaths(command).length === 0 &&
    call.shell.operands(tail, [...COMMIT_VALUED_OPTIONS]).length === 0
  );
}

// A commit records the restoration of the held files a commit changed when each of them is staged
// as the commit noted before holds it, and nothing else outside the scope is staged.
function recordsRestoration(project, input, { now, since, left }) {
  const staged = gitFields(project, ['diff', '--cached', '--name-only', '-z'], '\0').filter(Boolean);
  const outside = worktreeOutside(project, input);
  const held = new Set(left.map(([path]) => path));
  const committed = left.filter(
    ([path, target]) => target.head !== now.head && commitsOf(project, since, target.head).has(path),
  );
  return (
    committed.length > 0 &&
    staged.every((path) => held.has(path) || !outside(path)) &&
    committed.every(
      ([path, target]) =>
        staged.includes(path) && git(project, ['diff', '--cached', '--quiet', target.head, '--', path]) !== undefined,
    )
  );
}

// What a merge brought in is not put back path by path, which would undo the other side in the
// branch: the worker is given no step for it, and reports it.
function putBackReason(project, state, left) {
  const merged = mergedIn(project, state, left);
  const own = left.filter(([path]) => !merged.includes(path));
  const said = [
    ...(own.length > 0 ? [ownChangesReason(project, state, own)] : []),
    ...(merged.length > 0
      ? [
          `A merge brought files outside your scope into your branch: ${merged.join(', ')}. Its other side is no trunk the guard knows (the \`base\` of ${WORKER_SCOPE}, origin/HEAD, main, master, as they stood before the command that merged: a trunk fetched and merged by one command is not known yet, \`npx ddd-ts-kit merge-trunk\` merges it), so they are held as changes of your branch. Undo nothing, by \`git checkout\`, \`git rm\` or a reset: stop here and report the merge to the conductor, who knows what it brought in.`,
        ]
      : []),
  ];
  return said.join(' ');
}

// The held paths a commit since changed and that HEAD holds as a side merged since does.
function mergedIn(project, { now, since }, left) {
  const merged = new Set();
  for (const head of new Set(left.map(([, target]) => target.head))) {
    const committed = left
      .filter(
        ([path, target]) => target.head === head && head !== now.head && commitsOf(project, since, head).has(path),
      )
      .map(([path]) => path);
    for (const path of committed.length > 0 ? broughtIn(project, allMergedSides(project, head), committed) : []) {
      merged.add(path);
    }
  }
  return [...merged];
}

function ownChangesReason(project, state, left) {
  const steps = left.map((held) => putBackStep(project, state, held)).filter((step) => step.command);
  const afterwards = steps.flatMap((step) => (step.after ? [`, then \`${step.after}\``] : [])).join('');
  const commit = steps.some((step) => step.after !== undefined)
    ? `, then \`git commit\` to record it${afterwards}`
    : '';
  const kept = left.some(([, target]) => target.hash)
    ? ` A file already changed before that command is held to its content then, kept in ${GUARD_HELD}/.`
    : '';

  return `Your commands, or another session, changed files outside your scope: ${left.map(([path]) => path).join(', ')}. Put them back before anything else (${steps.map((step) => `\`${step.command}\``).join(', then ')}${commit}: allowed for these files), then change only files of your scope.${kept} ${REPORT_TO_CONDUCTOR}`;
}

// The command that brings one held file back to the state it is held to: its content before the
// command (kept by the guard, or deleted), its committed content, its old name, or no file at all.
function putBackStep(project, { now, since }, [path, target]) {
  const kept = 'clean' in target ? '' : target.hash ? `cp ${GUARD_HELD}/${target.hash} ${path}` : `rm ${path}`;
  const letter = target.head === now.head ? undefined : commitsOf(project, since, target.head).get(path);
  if (letter) {
    const restore = letter === 'A' ? 'git rm --' : `git checkout ${target.head.slice(0, 12)} --`;
    return { command: `${restore} ${path}`, after: kept };
  }
  if (kept) {
    return { command: kept };
  }
  const entry = now.changes[path];
  if (Object.values(now.changes).some((other) => other.from === path)) {
    return {};
  }
  if (entry.from) {
    return { command: `git mv ${path} ${entry.from}` };
  }
  if (entry.untracked) {
    return { command: `rm ${path}` };
  }
  return { command: entry.added ? `git rm -f -- ${path}` : `git checkout HEAD -- ${path}` };
}

// A file that is not a regular one (a link to a device, a FIFO) has a hash of its kind, never read;
// one past the bound a hash of its size and time, never read nor kept.
function contentHash(file, keep) {
  const stat = statSync(file, { throwIfNoEntry: false });
  if (stat === undefined) {
    return null;
  }
  const { content, tooLarge } = stat.isFile() ? readBounded(file, HASHED_FILE_BYTES, null) : {};
  if (tooLarge !== undefined) {
    return createHash('sha256').update(`past the bound: ${stat.size}:${stat.mtimeMs}`).digest('hex');
  }
  if (content === undefined) {
    return createHash('sha256').update(`not a file: ${stat.mode}`).digest('hex');
  }
  const hash = createHash('sha256').update(content).digest('hex');
  if (keep && !existsSync(join(keep, hash))) {
    writeKitFile(join(keep, hash), content);
  }
  return hash;
}
