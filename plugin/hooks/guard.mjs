#!/usr/bin/env node
// Fails open by design: a guard that breaks must never block the work it guards.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { call } from './call.mjs';
import { isDirectory, isRecord, readBounded, readJson, readText } from './disk.mjs';
import {
  baselineWriteReason,
  exportedVariables,
  gitConfigReason,
  hooksSkippedReason,
  landingReason,
  otherBranchReason,
  workerGitReason,
  workerPlaceReason,
} from './git-rules.mjs';
import { git, gitFields, gitRun, NOT_READ, unreadRepositoryNotice } from './git.mjs';
import {
  alreadyRemembered,
  forget,
  GUARD_HELD,
  markerOf,
  pruneGuardState,
  reminderMarker,
  sharedStateFile,
  stateFile,
  writeState,
} from './guard-state.mjs';
import { decide, emit, hostOf, patchWrites, readInput, sessionOf, toolInput, writesOf } from './hook-input.mjs';
import { removeKitFile, writeKitFile } from './kit-files.mjs';
import {
  ANSWER_BYTES,
  CLEAN_INSTALL,
  CONFIG,
  CONFIG_BYTES,
  describe,
  describePlace,
  errorsOf,
  findProject,
  FORMATTED_FILE,
  GUARD_MODES,
  insideContexts,
  installedBin,
  outsideItsModule,
  projectPath,
  runCli,
  TIME_SCALE,
} from './project.mjs';
import { gitDirOf, hasWorkerWorktree, STORY_SCOPE, WORKER_SCOPE } from './repository.mjs';
import {
  ABSOLUTE_PATH,
  AGENT_ID,
  COMMIT_ID,
  CONTEXT_NAME,
  GIT_REF,
  LABEL,
  named,
  quoted,
  STORY_ID,
} from './said-as-data.mjs';
import {
  AWK_PROGRAMS,
  CODE_RUNNERS,
  COMMIT_VALUED_OPTIONS,
  DEPENDENCY_CHANGES,
  gitInvocation,
  INSTALLS,
  installsPackages,
  isPureReader,
  kitInvocations,
  NEUTRAL_PROGRAMS,
  PURE_READERS,
  READING_PROGRAMS,
  readsAnywhere,
  readsFromAnywhere,
  RUNNING_PROGRAMS,
  runsCode,
  SCRIPT_MANAGERS,
  VALUED_MANAGER_OPTIONS,
} from './shell-reads.mjs';
import {
  ACCESS_COMMANDS,
  changedPaths,
  DOWNLOAD_FLAGS,
  FREE_OUTPUT,
  IN_PLACE_EDITORS,
  isFreePlace,
  multiplyNamed,
  PATH_COMMANDS,
  RSYNC_VALUED,
  targetDirectory,
  TOOL_WRITES,
  writtenTargets,
} from './shell-writes.mjs';
import {
  acceptanceFilesShellReason,
  acceptanceLockingReason,
  acceptanceReason,
  crossingNotice,
  fixOf,
  generates,
  generatorPlaceReason,
  isUnwrapping,
  lockedRegressionReason,
  storiesOf,
  storyCodeReason,
  storyOf,
  unfinishedStoryReason,
  worktreeCodeReason,
  worktreeNotice,
  writtenProjectPaths,
} from './story-rules.mjs';
import {
  commandDirectory,
  contextScopeReason,
  DECISION_RECORD,
  isWorkerAgent,
  linkReason,
  readPin,
  releasePin,
  REPORT_TO_CONDUCTOR,
  strayWriteReason,
  withPinnedMode,
  WORKER_AGENT,
  workerContext,
  workerScope,
  workerScopeReason,
} from './worker-scope.mjs';
import {
  baselineFileReason,
  dependencyReason,
  escapeReason,
  GENERATED_DOCUMENT,
  generatedFileReason,
  governedFileReason,
  handWrittenRoleReason,
  isBarrel,
  isTestWriter,
  scopeFileReason,
  scriptsChangeReason,
  testWriterScopeReason,
} from './write-rules.mjs';

// The version of the packages the skills of this plugin describe. `release-version.mjs` keeps it
// the version of the kit: setting a new version of the packages rewrites it.
const KIT_VERSION = '0.114.1';
const PLAN = 'docs/architecture/plan.md';

// A fetch older than this leaves the trunk of a story behind the remote one: the session is told to fetch.
const STALE_FETCH = 3_600_000;

// The builder of the plugin, as its hooks of SubagentStart and SubagentStop match it: the one counted.
const BUILDER_AGENT = `ddd-ts-kit:${WORKER_AGENT}`;

// The host caps SessionStart context at 10 000 characters; a session should start far below it.
const SESSION_CONTEXT_LIMIT = 3000;

// The merged sides a path is compared with, newest first, and the files of a folder read before a command.
const COMPARED_SIDES = 16;
const FOLDER_FILES = 5000;

const COUNTED_FILE_BYTES = 1_000_000;

const FORMAT_TIMEOUT = 5000;

// What a session start gives the CLI in all, of the 15 s of its hook: past it, the calls left are skipped.
const BRIEFING_BUDGET = 10_000;
// Said at session start under the regulated profile, in place of what the CLI would have answered.
const REGULATED_NOTICE =
  'Regulated profile: the guard runs no program of this project, neither its CLI nor its Biome, at any hook: the pipeline and the commit gate hold those checks, and `npx ddd-ts-kit check` runs them here.';

const BRIEFING_CUT =
  'Briefing cut short: the CLI did not answer in time; `npx ddd-ts-kit status` and `npx ddd-ts-kit list` say the rest.';
// The written files one call of post-write checks, of the 15 s of its hook: a patch of Codex can hold many.
const POST_WRITE_FILES = 5;
// The written files one call of pre-write has the CLI judge before they land, of the 5 s of its hook.
const CLI_WRITE_FILES = 2;

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
// Rewritten by a command: counted in no commit size, merged by regenerating.
const DERIVED_FILES = [...LOCKFILES, '.dependency-cruiser.cjs', 'docs/context-map.md'];
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

// The files a compiler, a linter or a test runner reads a suppression from: in Markdown or YAML the
// same words are prose, a constitution or a decision record that names the rule they break.
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;

// Generators that write outside the context they are given: the config, registries of the platform, the schema.
const SHARED_GENERATORS = [
  'context',
  'module',
  'repository',
  'integration-event',
  'job',
  'gateway',
  'policy',
  'service',
  'worker',
  'acceptance',
];

const UNREADABLE_COMMAND = `The guard could not read this command, and a worker runs none it cannot read: write it as shorter, separate commands. ${REPORT_TO_CONDUCTOR}`;
const UNCOMPARED_COMMITS =
  'The guard could not compare what your last command committed with the state it noted before it: git did not answer for the commits between them (one of them is gone from the repository, or git took too long). Nothing is taken as unchanged, and every call is held until git answers: report to the conductor.';
const UNCOMPARED_NOTE =
  'ddd-ts-kit: `git status` did not answer in full, so what your last command changed outside your scope was not compared. Name it in your report, for the conductor.';

const EDIT_WITH_TOOLS = `Inside your scope, the editor tools and the shell may both write; outside it, nothing may. ${FREE_OUTPUT}`;

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

// What takes a file away or gives it back its content from git: no one wrote the text it leaves,
// and a generated file is rebuilt after it.
const PUTS_BACK = new Set(['rm', 'unlink', 'git checkout', 'git restore', 'git rm', 'git clean']);

// The commands that, given a folder that exists, write the files they are given under it.
const LANDING_COMMANDS = new Set(['cp', 'mv', 'ln', 'install', 'rsync']);
// The options by which `cp` links instead of copying, or copies a whole tree.
const CP_BRINGS = /^(?:-[a-zA-Z]*[alrRs][a-zA-Z]*|--(?:link|symbolic-link|recursive|archive))$/;
const CP_TREE = /^(?:-[a-zA-Z]*[arR][a-zA-Z]*|--(?:recursive|archive))$/;

// What the guard reads of one file to compare it, and copies to hold it, within the 5 s of its hook.
const HASHED_FILE_BYTES = 16 * 1024 * 1024;
// The agents of the plugin that only read: they write their findings in their answer.
const READ_ONLY_AGENTS = ['architecture-reviewer', 'domain-explorer', 'story-verifier'];

// The variables that move where the shell finds a path, a directory or a program, or git its repository.
const PLACE_VARIABLES = /^(?:TMPDIR|XDG_RUNTIME_DIR|CDPATH|HOME|GIT_DIR|GIT_WORK_TREE|PATH)=/;
const MODES = {
  session,
  'pre-write': preWrite,
  'pre-bash': preBash,
  'post-write': postWrite,
  stop,
  'subagent-start': subagentStart,
  'subagent-stop': subagentStop,
};

main();

function main() {
  try {
    const run = MODES[process.argv[2]];
    if (run) {
      const input = readInput();
      call.input = isRecord(input) ? input : {};
      Promise.resolve(run(input))
        .then(sayNotice)
        .catch(() => {
          process.exitCode = 0;
        });
    }
  } catch {
    process.exitCode = 0;
  }
}

// A notice no decision carried is said alone, as context of the call.
function sayNotice() {
  if (call.notice) {
    emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: call.notice } });
  }
}

function session(input) {
  // A whole number of milliseconds: a time limit of spawnSync is an integer.
  call.briefingEnds = Date.now() + Math.round(BRIEFING_BUDGET * TIME_SCALE);
  const directory = input.cwd ?? process.cwd();
  const project = findProject(directory);
  if (project) {
    pruneGuardState(project.root);
  }
  const lines = project ? projectBriefing(project, input) : planPointer(directory);
  if (lines.length === 0) {
    return;
  }
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } });
}

async function preWrite(input) {
  if (isBuilder(input)) {
    const [first] = writesOf(input);
    await countBuilderCall(input, first && findProject(dirname(first.file)));
  }
  const verdict =
    strayFileVerdict(input) ?? writesVerdict(judgedWrites(writesOf(input), input), input, () => pendingOfWriter(input));
  if (verdict?.decision !== 'deny') {
    noteCrossings(input);
  }
  if (verdict) {
    decide(input, verdict.decision, verdict.reason);
  }
}

// A builder keeps the working directory of its session, in a project: a file of no project, unless
// the temp directory holds it, is outside its worktree too.
function strayFileVerdict(input) {
  const home = isWorkerAgent(input) ? findProject(input.cwd ?? process.cwd()) : undefined;
  if (!home || home.mode === 'off') {
    return undefined;
  }
  const stray = writesOf(input).find(({ file }) => !findProject(dirname(file)) && !isFreePlace(file));
  const { pinned } = readPin(home, input);
  if (!stray || !(pinned || hasWorkerWorktree(home.root))) {
    return undefined;
  }
  const where = pinned ? `your worktree ${pinned.worktree}` : 'the worktree of your briefing';
  return {
    decision: home.mode === 'advise' ? 'ask' : 'deny',
    reason: `${stray.file} is outside every project: a worker writes in ${where}, and in the temp directory. ${REPORT_TO_CONDUCTOR}`,
  };
}

// What the write meets of the other stories open in the repository, said with the decision of the call or alone.
function noteCrossings(input) {
  const crossings = writesOf(input).flatMap(({ file }) => {
    const project = findProject(dirname(file));
    const said =
      project && project.mode !== 'off' && existsSync(join(project.root, STORY_SCOPE))
        ? crossingNotice(project, input, file)
        : undefined;
    return said ? [said] : [];
  });
  if (crossings.length > 0) {
    call.notice = [call.notice, ...crossings].filter(Boolean).join('\n');
  }
}

// A worker whose inline code changed files outside its scope puts them back before writing again.
function pendingOfWriter(input) {
  const [first] = writesOf(input);
  const project = first && findProject(dirname(first.file));
  if (!project || project.mode === 'off' || !workerContext(project, input)) {
    return undefined;
  }
  const pending = pendingChangeReason(project, input, []);
  return pending?.reason ? { decision: project.mode === 'advise' ? 'ask' : 'deny', reason: pending.reason } : undefined;
}

// The writes of a call in a project the guard judges, each with its project.
function judgedWrites(writes, input) {
  return writes
    .map((written) => ({ ...written, project: withPinnedMode(findProject(dirname(written.file)), input) }))
    .filter(({ project }) => project && project.mode !== 'off');
}

// A patch of Codex can touch several files: a refusal of any of them wins over a question. The
// refusals that start no process come first, so that they hold within the time of the hook; then
// those the CLI decides; then what `pending` reads with git; then the questions.
function writesVerdict(writes, input, pending) {
  return (
    refusalOf(writes, input, quickRefusal) ??
    cliVerdict(writes, input) ??
    pending() ??
    writes.map((written) => deviationOf(written, input)).find(Boolean)
  );
}

// The first refusal, read file by file until one denies; a question waits for a denial of a later file.
function refusalOf(writes, input, check) {
  let asked;
  for (const written of writes) {
    const reason = check(written, input);
    if (reason && written.project.mode !== 'advise') {
      return { decision: 'deny', reason };
    }
    asked ??= reason ? { decision: 'ask', reason } : undefined;
  }
  return asked;
}

// The first files the CLI may judge (TypeScript, the code of a context: the build gate of a fix is
// read without it) are judged before the write; the others are left to the check after it, and said.
function cliVerdict(writes, input) {
  const judged = writes.filter(
    ({ project, file, deleted }) =>
      !deleted && (/\.(ts|mts|cts)$/.test(file) || insideContexts(project, projectPath(project, file))),
  );
  const verdict = refusalOf(judged.slice(0, CLI_WRITE_FILES), input, cliRefusal);
  if (!verdict && judged.length > CLI_WRITE_FILES) {
    call.notice = `ddd-ts-kit: ${judged.length - CLI_WRITE_FILES} more written file(s) not judged before the write here: the check after it reads them.`;
  }
  return verdict;
}

// A file a patch removes is judged as `rm` judges it: the baseline and the scope of a worker hold it.
function quickRefusal({ project, file, written, replaced, deleted }, input) {
  if (deleted) {
    return baselineFileReason(project, file) ?? workerScopeReason(project, file, input);
  }
  return (
    baselineFileReason(project, file) ??
    scopeFileReason(project, { place: file }, input) ??
    acceptanceReason(project, input, { file, written, replaced }) ??
    generatedFileReason(project, file) ??
    (isUnwrapping(project, file, input)
      ? undefined
      : (workerScopeReason(project, file, input) ?? linkReason(project, file, input))) ??
    strayWriteReason(project, input) ??
    testWriterScopeReason(project, file, input) ??
    worktreeCodeReason(project, file) ??
    handWrittenRoleReason(project, file)
  );
}

function cliRefusal({ project, file, written, replaced }, input) {
  return storyCodeReason(project, file) ?? dependencyReason(project, { file, written, replaced }, input);
}

function deviationOf({ project, file, written, replaced, deleted }, input) {
  if (deleted) {
    return undefined;
  }
  const deviation =
    governedFileReason(project, file) ??
    scriptsChangeReason(project, file, input) ??
    (SCRIPT_FILE.test(file) ? escapeReason(written, replaced) : undefined);
  return deviation ? { decision: 'ask', reason: deviation } : undefined;
}

// A refusal of the patch Codex applies through its shell wins; else the command line is read, and a
// question about the patch is put only when the rest of the line passes.
async function preBash(input) {
  const command = toolInput(input).command;
  if (typeof command !== 'string') {
    return;
  }
  const cwd = input.cwd ?? process.cwd();
  const patched = await codexPatchVerdict(input, command, cwd);
  const verdict = patched?.decision === 'deny' ? patched : ((await shellVerdict(input, command, cwd)) ?? patched);
  if (verdict) {
    decide(input, verdict.decision, verdict.reason);
  }
}

async function shellVerdict(input, command, cwd) {
  call.shell = await readerOfTheShell();
  // A leading `cd` out of every project leaves the command to be judged against the session's project;
  // a worker whose session stands in no project is judged in the project its command names.
  const project = withPinnedMode(
    findProject(commandDirectory(command, cwd)) ?? findProject(cwd) ?? namedProject(input, command, cwd),
    input,
  );
  await countBuilderCall(input, project, command);
  if (!project || project.mode === 'off') {
    return undefined;
  }
  const decision = project.mode === 'advise' ? 'ask' : 'deny';
  const commands = readCommands(project, command, cwd);
  if (!commands) {
    return isHeldToAWorktree(project, input) ? { decision, reason: UNREADABLE_COMMAND } : undefined;
  }
  const preparing = await preparingReason(project, input, { command, commands });
  if (preparing) {
    return { decision, reason: preparing };
  }
  const context = workerContext(project, input);
  const refusal = context
    ? workerCommandReason(project, input, { context, command, commands })
    : (builderStrayReason(project, input, commands) ?? sessionShellReason(input, commands));
  return refusal ? { decision, reason: refusal } : undefined;
}

// The reader of the shell, told once the programs the guard judges by a table of its own: a first
// word that is none of them may be a wrapper, and the words after it are then read as commands.
async function readerOfTheShell() {
  const reader = await import('./shell-commands.mjs');
  reader.knowPrograms([
    ...[...PURE_READERS].filter(Boolean),
    ...READING_PROGRAMS,
    ...NEUTRAL_PROGRAMS,
    ...AWK_PROGRAMS,
    ...RUNNING_PROGRAMS,
    ...CODE_RUNNERS,
    ...IN_PLACE_EDITORS,
    ...Object.keys({ ...PATH_COMMANDS, ...ACCESS_COMMANDS, ...TOOL_WRITES, ...DOWNLOAD_FLAGS }),
    ...['git', 'dd', 'patch', 'tar', 'unzip', 'rsync', 'sed', 'tee', 'apply_patch'],
  ]);
  return reader;
}

// The project of the first place a worker's command names (a directory it moves to, a file it writes):
// a session opened above a project still holds its worker to that project.
function namedProject(input, command, cwd) {
  if (!isWorkerAgent(input)) {
    return undefined;
  }
  let commands;
  try {
    commands = call.shell.simpleCommands(command, cwd);
  } catch {
    return undefined;
  }
  const places = commands.flatMap((simple) => [
    ...(['cd', 'pushd'].includes(call.shell.commandName(simple.words))
      ? [{ place: call.shell.placeOf(simple.words[1] ?? call.shell.UNKNOWN, simple.directory) }]
      : []),
    ...writtenTargets(simple),
    ...changedPaths(simple),
  ]);
  return places.map(({ place }) => place && findProject(place)).find(Boolean);
}

// The commands of a line and the places they write, read once here: the rules that follow read the
// same text, so a reader that breaks on it answers no command at all.
function readCommands(project, command, cwd) {
  try {
    const commands = call.shell.simpleCommands(command, cwd);
    writtenProjectPaths(project, commands);
    return commands;
  } catch {
    return undefined;
  }
}

// What the shell writes of a session that is not a context worker meet, in the project each place
// belongs to: the story build gate and the generated or baseline files for everyone, the test-writer
// held to the paths of a test. What a redirection, `sed -i` or `tee` types in a file is held as the
// editor tools are; what a command only moves, deletes or restores is not.
function sessionShellReason(input, commands) {
  const reading = readOnlyReason(input, commands);
  if (reading) {
    return reading;
  }
  for (const command of commands) {
    const typed = writtenTargets(command).map((target) => ({ ...target, typed: true }));
    for (const target of [...typed, ...changedPaths(command)]) {
      const refusal = sessionPlaceReason(input, target);
      if (refusal) {
        return `${target.by}: ${refusal}`;
      }
    }
  }
  return undefined;
}

// The reviewer, the explorer and the verifier of the plugin change no file of a project, by any tool:
// nor its work tree by git, whose index alone they may stage.
function readOnlyReason(input, commands) {
  if (!READ_ONLY_AGENTS.some((name) => String(input.agent_type ?? '').includes(name))) {
    return undefined;
  }
  for (const command of commands) {
    const written = [...writtenTargets(command), ...changedPaths(command)].find(
      ({ place }) => place !== undefined && findProject(place) !== undefined,
    );
    const { subcommand, tail } = gitInvocation(command.words.slice(1), command.directory);
    const git =
      call.shell.commandName(command.words) === 'git' && !readsAnywhere(subcommand, tail) && subcommand !== 'add';
    if (written || git) {
      const by = written ? `${written.by} changes ${written.place}` : `\`git ${subcommand}\` changes the work tree`;
      return `A read-only agent changes no file of a project: ${by}. Read with \`git show <ref>:<path>\` and \`git diff\`, and write what you find in your answer. ${FREE_OUTPUT}`;
    }
  }
  return undefined;
}

function sessionPlaceReason(input, { place, by, typed, below }) {
  const testWriter = isTestWriter(input);
  if (place === undefined) {
    return testWriter
      ? `The test writer changes tests only, and writes with the shell only to a file it names: this command writes files only the shell knows. Name each file, after a certain \`cd <folder> && ...\`. ${FREE_OUTPUT}`
      : undefined;
  }
  const owner = findProject(place);
  if (!owner || owner.mode === 'off') {
    return undefined;
  }
  return (
    scopeFileReason(owner, { place, below }, input) ??
    lockedRegressionReason(owner, projectPath(owner, place), input) ??
    (testWriter
      ? testWriterScopeReason(owner, place, input)
      : (storyCodeReason(owner, place) ??
        (PUTS_BACK.has(by) ? undefined : generatedFileReason(owner, place)) ??
        baselineFileReason(owner, place) ??
        (typed ? (worktreeCodeReason(owner, place) ?? handWrittenRoleReason(owner, place)) : undefined)))
  );
}

// Codex applies a patch through `apply_patch` in its shell tool as well as its patch tool: each patch
// the line holds (a here-document, an argument) is judged the same way a write through the editor tool
// is; a patch the command does not hold (read from a file, a pipe) cannot be judged and is refused. A
// here-document that only holds the text of a patch for another command (`cat <<EOF > notes.md`) is no patch.
async function codexPatchVerdict(input, command, cwd) {
  if (hostOf(input) !== 'codex') {
    return undefined;
  }
  call.shell = await readerOfTheShell();
  const project = findProject(cwd);
  const commands = readCommands(project ?? { root: cwd }, command, cwd);
  if (!commands?.some(({ words }) => call.shell.commandName(words) === 'apply_patch')) {
    return undefined;
  }
  const patches = command.split('*** Begin Patch').slice(1);
  if (patches.length === 0) {
    return !project || project.mode === 'off'
      ? undefined
      : {
          decision: project.mode === 'advise' ? 'ask' : 'deny',
          reason:
            "apply_patch is judged when the command holds the patch: give it as a here-document (`apply_patch <<'EOF'` ... `EOF`), not from a file or a pipe.",
        };
  }
  const writes = patches.flatMap((patch) => patchWrites(patch.split('*** End Patch')[0], cwd));
  return writesVerdict(judgedWrites(writes, input), input, () => undefined);
}

// A context-builder keeps the working directory of its session, so the scope of a worker is found
// only when the command moves into its worktree (`cd <worktree> && ...` or `--cwd`). When the
// session has worker worktrees and a builder's command touches no scoped project, a write by that
// command lands where the guard cannot judge it: it is refused, with the one shape it reads.
function builderStrayReason(project, input, commands) {
  if (!isHeldToAWorktree(project, input)) {
    return undefined;
  }
  // What holds a worker whatever its scope holds it here too: a read under another HOME, PATH or
  // GIT_DIR is no longer the read the guard judged.
  const moved = placeVariableReason(commands);
  if (moved || !builderWrites(commands)) {
    return moved;
  }
  return 'A worker runs every command as `cd <worktree> && ...` so that the guard reads it against the scope of that worktree; this command writes without moving into a worktree of your project. Run it as `cd <worktree> && ...`.';
}

// An agent that holds the worker's name, with a scope of its own or in a repository of worker
// worktrees: outside a scoped checkout, it is out of its place.
function isHeldToAWorktree(project, input) {
  return isWorkerAgent(input) && (workerScope(project, input) !== undefined || hasWorkerWorktree(project.root));
}

// A redirection, a writer of the tables, a generator of the kit, a line the reader could not read to
// its end, or any program but those that read: outside its worktree a worker reads only.
function builderWrites(commands) {
  return (
    generates(commands, []) ||
    commands.some(
      (command) =>
        command.truncated ||
        writtenTargets(command).length > 0 ||
        changedPaths(command).length > 0 ||
        !readsFromAnywhere(command),
    )
  );
}

// What no agent runs, then what waits for a place, a landing, a lock or a generator first.
async function preparingReason(project, input, { command, commands }) {
  return (
    baselineWriteReason(project, commands) ??
    hooksSkippedReason(commands) ??
    gitConfigReason(input, commands) ??
    otherBranchReason(input, commands) ??
    workerPlaceReason(input, commands) ??
    landingReason(input, commands) ??
    workerGitReason(project, input, commands) ??
    oneSideMergeReason(project, input, commands) ??
    acceptanceLockingReason(input, commands) ??
    acceptanceFilesShellReason(project, input, { command, commands }) ??
    generatorPlaceReason(project, commands)
  );
}

// What a worker may not run: anything once its scope file changed, a file it must put back first,
// then what the command itself would do; a command allowed to run code the guard cannot read has
// the state outside the scope noted before it.
function workerCommandReason(project, input, { context, command, commands }) {
  const { changed } = workerScope(project, input);
  if (changed) {
    return changed;
  }
  const pending = pendingChangeReason(project, input, commands);
  if (pending?.reason) {
    return pending.reason;
  }
  // A command that puts back held files changes them outside the scope: only that check is lifted.
  const refusal =
    sharedGeneratorReason(project, context, commands) ??
    dependencyChangeReason(commands) ??
    workingMigrationReason(command) ??
    formatterReason(project, commands) ??
    unknownProgramReason(commands) ??
    placeVariableReason(commands) ??
    elsewhereReason(project, commands) ??
    (pending ? undefined : fileChangeReason(project, input, commands)) ??
    unreadReason(commands);
  if (!refusal && !pending) {
    noteBeforeCode(project, input, commands);
  }
  return refusal;
}

// A command that a `cd` further down the line, or an option of a package runner (`pnpm -C <dir> exec`,
// `npm --prefix <dir> exec`), runs in another checkout: there a worker reads, and runs nothing.
function elsewhereReason(project, commands) {
  const elsewhere = (place) => (findProject(place)?.root ?? project.root) !== project.root;
  const acts = (command) => !isPureReader(command) && !readsFromAnywhere(command);
  // After a `cd` the guard cannot follow (`cd <dir>; cmd`, a subshell), a command runs where that
  // `cd` leads when it succeeds: the checkout it names is where the command is judged.
  const led = commands
    .filter(({ words }) => ['cd', 'pushd'].includes(call.shell.commandName(words)))
    .map(({ words, directory }) => call.shell.placeOf(words[1] ?? call.shell.UNKNOWN, directory ?? project.root))
    .find((place) => place !== undefined && elsewhere(place));
  const moved = commands.find(
    (command) => acts(command) && (command.directory === undefined ? led !== undefined : elsewhere(command.directory)),
  );
  return moved
    ? `A worker runs its commands in its own worktree: \`${call.shell.commandName(moved.words)}\` would run in ${moved.directory ?? led}, another checkout, where a worker only reads (\`git log\`, \`git diff\`, \`cat\`). ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

// A command nested in more shells or evals than the reader follows, or a line that ends inside a
// quote or a here-document, leaves commands the reader never saw: a worker's is refused, since the
// guard cannot see what it writes.
function unreadReason(commands) {
  const unread = commands.find((command) => command.truncated)?.truncated;
  if (unread === undefined) {
    return undefined;
  }
  return unread === 'nested'
    ? `A command nested deeper than the guard reads is refused to a worker: write it as separate, flatter commands. ${REPORT_TO_CONDUCTOR}`
    : `A quote, a substitution or a here-document of this command never closes, so the guard cannot read what follows it: close it, or write separate commands. ${REPORT_TO_CONDUCTOR}`;
}

// The variables by which the shell and git find their places: set by a worker, the places the guard
// reads would no longer be the places written.
function placeVariableReason(commands) {
  const variable = commands.flatMap(exportedVariables).find((word) => PLACE_VARIABLES.test(word));
  return variable
    ? `A worker sets no \`${variable.split('=')[0]}\`: it changes where the shell or git read and write, and the guard reads the places of a command by their values when the session started. ${EDIT_WITH_TOOLS}`
    : undefined;
}

// A command whose program word holds a variable or a substitution runs a name only the shell
// computes, which the guard cannot judge; `eval` of such a text leaves the same unreadable word.
function unknownProgramReason(commands) {
  for (const { words } of commands) {
    const program = words[0];
    if (program !== undefined && (program.includes(call.shell.UNKNOWN) || program.includes('$'))) {
      const shown = program.replaceAll(call.shell.UNKNOWN, '$(...)');
      return `A worker runs no command whose name only the shell knows: \`${shown}\` is computed when the command runs. ${EDIT_WITH_TOOLS}`;
    }
  }
  return undefined;
}

function postWrite(input) {
  const all = writesOf(input).filter(({ deleted }) => !deleted);
  // Biome lays out every written file, which is quick; the check, which is not, reads the first ones.
  formatWrites(all);
  // Under the regulated profile no file is checked here, so none is one left out.
  const checkable = all.filter(({ file }) => !findProject(dirname(file))?.regulated);
  const writes = checkable.slice(0, POST_WRITE_FILES);
  const errors = writes.filter(({ file }) => isChecked(file)).flatMap(({ file }) => checkWritten(file));
  const unchecked =
    checkable.length > writes.length
      ? `ddd-ts-kit: ${checkable.length - writes.length} more written file(s) not checked here: run \`npx ddd-ts-kit check\``
      : undefined;
  if (errors.length === 0) {
    return unchecked ? emit({ systemMessage: unchecked }) : undefined;
  }
  const feedback = [
    `ddd-ts-kit: the file just written breaks ${errors.length} architecture rule(s). Fix them now, do not suppress.\n${describe(errors)}`,
    ...(unchecked ? [unchecked] : []),
  ].join('\n');
  // Codex hands the reason of a block to the model in place of the result of the tool.
  if (hostOf(input) === 'codex') {
    return emit({ decision: 'block', reason: feedback });
  }
  process.stderr.write(`${feedback}\n`);
  process.exitCode = 2;
}

function checkWritten(file) {
  const project = findProject(dirname(file));
  return project?.cli && project.mode !== 'off' ? errorsOf(runCli(project, ['check-file', file, '--json'], 12000)) : [];
}

// With `formatOnWrite` in the config, the Biome the project installed lays out each written file
// before it is checked, so that the layout is settled at the write and the lint findings that follow
// a wrapped line come back in the same output. One file, the bin of the package the project installed
// only, never `npx biome`.
function formatWrites(writes) {
  for (const { file } of writes) {
    const project = findProject(dirname(file));
    if (!project?.formatOnWrite || project.mode === 'off' || !FORMATTED_FILE.test(file) || !existsSync(file)) {
      continue;
    }
    const biome = installedBin(join(project.root, 'node_modules', '@biomejs', 'biome'), '@biomejs/biome', 'biome');
    if (biome) {
      spawnSync(process.execPath, [biome.bin, 'format', '--write', file], {
        cwd: project.root,
        encoding: 'utf8',
        timeout: FORMAT_TIMEOUT,
        maxBuffer: ANSWER_BYTES,
      });
    }
  }
}

// The context-builder of the plugin in Claude Code: its tool calls are counted, its runs and stops recorded.
// An agent of the project named otherwise is held to the scope of a worker (`workerContext`), not counted.
function isBuilder(input) {
  return hostOf(input) === 'claude' && input.agent_type === BUILDER_AGENT;
}

async function countBuilderCall(input, project, command) {
  const places = isBuilder(input) && project?.mode !== 'off' ? builderPlaces(input, project) : undefined;
  if (places) {
    const runs = await import('./builder-runs.mjs');
    try {
      call.notice = runs.countCall(input, places, command);
    } catch {
      // a count that fails never drops the decision of the call
    }
  }
}

// The project of the session (the conductor's: a sub-agent keeps the working directory of its
// session) holds the state of each builder's run in the guard's folder; the worktree of the builder,
// shown by the call, holds what the conductor reads back.
function builderPlaces(input, project) {
  const home = findProject(input.cwd ?? process.cwd()) ?? project;
  if (!home || home.mode === 'off' || project?.mode === 'off') {
    return undefined;
  }
  const worker = project && existsSync(join(project.root, WORKER_SCOPE)) ? project.root : undefined;
  // Its git is the guard's: under the regulated profile, it runs where the guard runs it.
  return {
    state: sharedStateFile('turns', home, input),
    worker,
    home,
    git: (directory, args) => git({ root: directory }, args),
  };
}

// A new run of a builder: the note its last run left before inline code is dropped, since what
// changed outside its scope since then is the conductor's as much as its own; what that code changed
// and was not put back stays recorded.
async function subagentStart(input) {
  const places = isBuilder(input) ? builderPlaces(input, undefined) : undefined;
  if (!places) {
    return;
  }
  const worker = readJson(places.state)?.worker;
  if (typeof worker === 'string') {
    removeKitFile(stateFile('before-run', { root: worker }, input));
    pruneGuardState(worker);
  }
  (await import('./builder-runs.mjs')).startRun(input, places);
}

// A builder that ends, unless kept going once, releases the pin of its scope when its scope file is
// still the one pinned; a pin whose scope file changed stays, for the conductor to see, a week at most.
// Its last command has no next call: what it left outside the scope is compared here, the worker
// keeps going once to put it back, and what stays reaches the conductor with the stop.
async function subagentStop(input) {
  const places = isBuilder(input) ? builderPlaces(input, undefined) : undefined;
  if (!places) {
    return;
  }
  const runs = await import('./builder-runs.mjs');
  const outside = changedAtStop(places, input);
  const reason = runs.stopRun(input, places, outside);
  if (reason) {
    emit({ decision: 'block', reason });
    return;
  }
  releasePin(sharedStateFile('scope', places.home, input));
  if (outside) {
    emit({ systemMessage: `ddd-ts-kit: ${outside}` });
  }
}

// What the note before the last command, and the files still held, say at the stop of a worker.
function changedAtStop(places, input) {
  const worktree = readJson(places.state)?.worker;
  const project = typeof worktree === 'string' ? findProject(worktree) : undefined;
  if (!project || !workerContext(project, input)) {
    return undefined;
  }
  const { changed } = workerScope(project, input);
  const told = settleNote(project, input, false) ?? heldChangeReason(project, input, [])?.reason;
  const said = [call.notice, changed, told, branchOutsideReason(project, input)].filter(Boolean).join('\n');
  call.notice = undefined;
  return said || undefined;
}

// What the branch of a worker holds outside its scope since the base its scope file recorded when
// the worker was pinned: its commits since then, what the trunk brought in left out, and what stays
// uncommitted. A scope file that records no base leaves the commits uncompared, as the guard fails open.
function branchOutsideReason(project, input) {
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

function stop(input) {
  if (input.stop_hook_active) {
    return;
  }
  const project = findProject(input.cwd ?? process.cwd());
  if (!project || project.mode === 'off') {
    return;
  }
  const errors = remainingErrors(project);
  if (errors.length > 0) {
    return stopAlreadyRefused(project, input, errors) ? undefined : blockStop(errors);
  }
  const unfinished = unfinishedStoryReason(project, input);
  if (unfinished) {
    return emit({ decision: 'block', reason: unfinished });
  }
  const reminders = [
    unfinishedCheck(),
    ...unreadRepositoryNotice(project).map((line) => `ddd-ts-kit: ${line}`),
    commitReminder(project, input, { repeat: false }),
    designReminder(project, input),
  ].filter(Boolean);
  // Warnings shown to the user, never a block: the size of a commit and a design departed from are advice.
  if (reminders.length > 0) {
    emit({ systemMessage: reminders.join('\n') });
  }
}

// A check stopped at its time limit, or past what the guard reads, lets the stop through: the session
// is told it did not finish.
function unfinishedCheck() {
  if (call.oversized.has('check')) {
    return 'architecture check answered more than the guard reads: run `npx ddd-ts-kit check`';
  }
  const seconds = call.timedOut.get('check');
  return seconds === undefined
    ? undefined
    : `architecture check timed out after ${seconds} s: run \`npx ddd-ts-kit check\``;
}

// In the worktree of a story, a done row whose design review cites a name the code does not have,
// with no compromise listed in the report: said once per session for the same names, never blocking.
function designReminder(project, input) {
  const story = storyOf(project);
  if (story === undefined || !project.cli || fixOf(project) !== undefined) {
    return undefined;
  }
  const design = runCli(project, ['story-check', story, '--json'], 20000)?.design ?? [];
  if (design.length === 0) {
    return undefined;
  }
  const key = createHash('sha256')
    .update(
      `${project.root}\n${sessionOf(input)}\n${design.map(({ document, line, cited }) => `${document}:${line}:${cited}`).join('\n')}`,
    )
    .digest('hex')
    .slice(0, 24);
  if (alreadyRemembered(markerOf(project, 'design', key))) {
    return undefined;
  }
  const named = design
    .slice(0, 5)
    .map(({ cited, row, document, line }) => `\`${cited}\` (#${row}, ${document}:${line})`)
    .join(', ');
  return `ddd-ts-kit: a row departed from its design: update its review section or list the compromise. ${design.length} name(s) of the design of story ${story} are not in the code: ${named}. \`npx ddd-ts-kit story-check ${story}\` lists them, and \`### Compromises\` of \`## Report\` in docs/architecture/stories/${story}.md records what was built otherwise.`;
}

function remainingErrors(project) {
  if (!project.cli || project.mode !== 'enforce' || !hasPendingChanges(project)) {
    return [];
  }

  return errorsOf(runCli(project, ['check', '--format', 'json'], 60000));
}

// A host that does not say whether the stop was already refused (`stop_hook_active`) is refused
// once per session for the same errors: a refusal it cannot get out of would never end.
function stopAlreadyRefused(project, input, errors) {
  if (typeof input.stop_hook_active === 'boolean') {
    return false;
  }
  const key = createHash('sha256')
    .update(`${project.root}\n${sessionOf(input)}\n${describe(errors)}`)
    .digest('hex')
    .slice(0, 24);

  return alreadyRemembered(markerOf(project, 'stop', key));
}

function blockStop(errors) {
  emit({
    decision: 'block',
    reason: `ddd-ts-kit: ${errors.length} architecture error(s) remain. Fix them before finishing, do not suppress or lower a severity.\n${describe(errors.slice(0, 10))}`,
  });
}

function projectBriefing(project, input) {
  const lines = [
    'ddd-ts-kit project (DDD, Clean Architecture). The rules are checked: `npx ddd-ts-kit explain <rule-id>`.',
    'Order of work: glossary of the context (CONTEXT.md), `npx ddd-ts-kit generate <kind> ... --json`, fill only the TODO(domain) places it lists, tests, `npx ddd-ts-kit check --changed-since <ref>`, then commit the slice.',
    'Never write by hand a file a generator produces; never edit a generated file (declaration barrels, contracts).',
    'Read `npx ddd-ts-kit list` (text; `--json` for a script) and the CONTEXT.md of one context instead of browsing the tree.',
    ...mergeNotice(project),
    ...configNotice(project),
    ...unreadRepositoryNotice(project),
    ...(project.mode === 'off' ? [] : versionGap(project)),
    ...planPointer(project.root),
    ...workerNotice(project, input),
    ...storyNotice(project),
    ...worktreeNotice(project),
    ...workersToResume(project),
  ];
  if (project.cli) {
    lines.push('Contexts:', contextMap(project));
  } else {
    lines.push(project.regulated ? REGULATED_NOTICE : installAdvice(project));
  }
  if (call.briefingCut) {
    lines.push(BRIEFING_CUT);
  }
  const reminder = project.mode === 'off' ? undefined : commitReminder(project, input, { repeat: true });

  return (reminder ? [...lines, reminder] : lines).map((line) => inRunnerOf(project, line));
}

// The commands of the preamble in the dialect of the project: the runner its settings allow and its AGENTS.md names.
function inRunnerOf(project, line) {
  return project.packageManager === 'pnpm' ? line.replaceAll('npx ddd-ts-kit', 'pnpm exec ddd-ts-kit') : line;
}

// A merge half done: MERGE_HEAD in the git directory of this checkout, and what merge-trunk kept of it.
// Said first, so that a resumed session does not generate or commit on top of it.
function mergeNotice(project) {
  const gitDir = gitDirOf(project.root);
  if (!gitDir || !existsSync(join(gitDir, 'MERGE_HEAD'))) {
    return [];
  }
  const report = readJson(join(project.root, '.ddd-ts-kit', 'merge.json'))?.report;
  if (!report || typeof report !== 'object') {
    return [
      'Merge in progress, not started by merge-trunk: finish it with git, or undo it with `npx ddd-ts-kit merge-trunk --abort`.',
    ];
  }
  const left = Array.isArray(report.forYou) ? report.forYou.length : 0;
  return [
    `Merge in progress: ${quoted(report.branch).slice(1, -1)} <- ${quoted(report.trunk?.ref).slice(1, -1)}, ${left} ${left === 1 ? 'path' : 'paths'} left for you when it stopped: \`npx ddd-ts-kit merge-trunk --continue\` or \`--abort\`.`,
  ];
}

// What the guard could not take of the config as written: a mode it does not know, a file too large.
function configNotice(project) {
  if (project.tooLarge !== undefined) {
    return [
      `${CONFIG} holds ${Math.round(project.tooLarge / 1024)} KB, more than the ${CONFIG_BYTES / 1024} KB the guard reads: it judges nothing in this project until the config is smaller.`,
    ];
  }
  return project.unknownMode === undefined
    ? []
    : [`guard: ${quoted(project.unknownMode)} is not a mode (${GUARD_MODES.join(', ')}): enforce applies.`];
}

// A worktree of a project that already depends on the kit lacks its install, not the kit.
function installAdvice(project) {
  const manifest = readJson(join(project.root, 'package.json'));
  const listed = ['dependencies', 'devDependencies'].some((field) => manifest?.[field]?.['ddd-ts-kit'] !== undefined);
  if (listed) {
    return `The dependencies are not installed here: run \`${CLEAN_INSTALL[project.packageManager]}\`, never an install that names a package.`;
  }

  return `The CLI is not installed in this project: \`${project.packageManager === 'pnpm' ? 'pnpm add -D' : 'npm i -D'} ddd-ts-kit\`.`;
}

// The skills describe KIT_VERSION while the checks run the CLI the project installed, and the
// plugin is updated apart from the lockfile. A gap is said at session start, never blocked.
function versionGap(project) {
  const installed = project.cliVersion;
  if (typeof installed !== 'string' || compatible(installed, KIT_VERSION)) {
    return [];
  }
  const move = isOlder(installed, KIT_VERSION)
    ? `upgrade \`ddd-ts-kit\` and every \`@ddd-ts-kit/*\` package together (the steps: node_modules/ddd-ts-kit/CHANGELOG.md; then \`npx ddd-ts-kit doctor\` lists what the upgrade left to do), or use the plugin release written for ${installed}`
    : 'update the plugin';

  return [
    `Version gap: this plugin describes ddd-ts-kit ${KIT_VERSION}, the project has ${installed} installed. A skill may name an API or a rule that ${installed} does not have, and the checks follow ${installed}: ${move}.`,
  ];
}

// As a caret range: below 1.0.0 a minor version may break, from 1.0.0 a major one.
function compatible(installed, described) {
  const [have, want] = [releaseOf(installed), releaseOf(described)];
  return have[0] === want[0] && (have[0] !== 0 || have[1] === want[1]);
}

function isOlder(installed, described) {
  const [have, want] = [releaseOf(installed), releaseOf(described)];
  const differs = have.findIndex((part, index) => part !== want[index]);
  return differs !== -1 && have[differs] < want[differs];
}

function releaseOf(version) {
  return version.split(/[.+-]/, 3).map(Number);
}

function planPointer(root) {
  const plan = readText(join(root, PLAN));
  if (plan === undefined) {
    return [];
  }
  const next = /^Next:\s*(.+)$/m.exec(plan)?.[1];
  return [
    `Plan (${PLAN}): ${next ? quoted(next) : 'no next step stated, read the plan'}. Resume with /ddd-ts-kit:start.`,
  ];
}

// In the worktree of a story: the story, its phase and its next step, so that a session resumes it.
function storyNotice(project) {
  const story = storyOf(project);
  if (story === undefined || project.mode === 'off' || !project.cli) {
    return [];
  }
  const phases = runCli(project, ['story', story, '--json'], 6000);
  if (!phases) {
    return [`Story ${story}: run \`npx ddd-ts-kit story ${story}\` for where it stands.`];
  }
  const done = phases.phases.filter(({ met }) => met).map(({ title }) => title);
  const kind = fixOf(project) === undefined ? ['Story', 'story'] : ['Fix', 'fix'];
  return [
    `${kind[0]} ${story} (skill ddd-ts-kit:${kind[1]}): ${done.length === 0 ? 'nothing done yet' : `done: ${done.join(', ')}`}. Next: ${phases.next ? quoted(phases.next) : 'its pull request'}`,
    ...meetingNotice(project),
  ];
}

// Where this story meets the other open ones and how far the trunk moved, at session start.
function meetingNotice(project) {
  const view = storiesOf(project)?.view;
  const own = view?.stories.find(({ story }) => story === view.here);
  if (!own) {
    return [];
  }
  const meetings = view.crossings.map(({ stories: [, other], contexts, files, merge }) => {
    const shown = contexts.filter((name) => named(name, CONTEXT_NAME));
    const parts = [
      ...(shown.length === 0 ? [] : [`contexts ${shown.join(', ')}`]),
      ...(files.length === 0 ? [] : [`${files.length} file(s) both change`]),
      ...((merge?.byHand.length ?? 0) === 0 ? [] : [`${merge.byHand.length} conflict(s) to settle by hand`]),
    ];
    const story = named(other, STORY_ID);
    return `It meets ${story ? `story ${story}` : 'another open story'}: ${parts.length === 0 ? 'conflicts merge-trunk settles' : parts.join(', ')}.`;
  });
  const trunk = own.trunk?.behind
    ? [
        `The trunk moved: ${own.trunk.behind} commit(s) of ${named(own.trunk.ref, GIT_REF) ?? 'the trunk'} to merge in${own.trunk.byHand.length === 0 ? '' : `, ${own.trunk.byHand.length} conflict(s) to settle by hand`}.`,
      ]
    : [];
  const fetched = view.fetched ? Date.parse(view.fetched) : undefined;
  if (fetched !== undefined && Date.now() - fetched > STALE_FETCH) {
    trunk.push(`The trunk is read as the fetch of ${new Date(fetched).toISOString()} left it: \`git fetch\` first.`);
  }
  return meetings.length + trunk.length === 0
    ? []
    : [...meetings, ...trunk, '`npx ddd-ts-kit stories` says where, before the rows are cut and before each row.'];
}

function workerNotice(project, input) {
  const context = workerContext(project, input);
  return context
    ? [
        `Worker scope: bounded context "${context}" only (${project.contextsDir}/${context}/, with Prisma its models in prisma/schema/${context}.prisma). Shared files belong to the conductor.`,
      ]
    : [];
}

// In the conductor's session, the workers whose agent stopped: one line each with the command
// that resumes it. Asked of the CLI only when a worktree of the repository holds a worker: a
// session without one starts no process for it.
function workersToResume(project) {
  if (project.mode === 'off' || !project.cli || existsSync(join(project.root, WORKER_SCOPE))) {
    return [];
  }
  if (!hasWorkerWorktree(project.root)) {
    return [];
  }
  const workers = runCli(project, ['status', '--workers', '--json'], 6000)?.workers ?? [];
  const stopped = workers.filter(
    ({ progress }) =>
      ['send-message', 'new-agent'].includes(progress?.next?.action) &&
      (progress.agent || progress.phase !== 'not started'),
  );
  return stopped.map((stoppedWorker) => resumeLine(stoppedWorker, workers));
}

// The line of a worker to resume, when each name it repeats follows its grammar: its worktree is
// needed only when it names the worker (no branch) or tells two workers of one context apart.
function resumeLine({ branch, context, worktree, progress }, workers) {
  const agent = progress.agent ? named(progress.agent.agentId, AGENT_ID) : '';
  const path = named(worktree, ABSOLUTE_PATH);
  const shown = branch === undefined ? path : named(branch, GIT_REF);
  const shared = workers.filter((other) => other.context === context).length > 1;
  const names = [named(context, CONTEXT_NAME), named(progress.phase, LABEL), agent, shown, shared ? path : ''];
  if (names.includes(undefined)) {
    return 'Worker to resume: one whose names the guard does not repeat: `npx ddd-ts-kit status --workers` lists it.';
  }
  const where = shared ? ` --worktree ${path.includes(' ') ? `'${path}'` : path}` : '';
  return `Worker to resume: ${shown} (${progress.phase}${agent ? `, agent ${agent}` : ''}): \`npx ddd-ts-kit worker-scope ${context} --resume${where}\`, then send what it prints.`;
}

function contextMap(project) {
  const listing = runCli(project, ['list', '--json'], 8000);
  const text = (listing?.contexts ?? [])
    .filter((context) => named(context.name, CONTEXT_NAME))
    .map(contextLine)
    .join('\n');
  return text.length > SESSION_CONTEXT_LIMIT
    ? `${text.slice(0, SESSION_CONTEXT_LIMIT)}\n(truncated: run \`npx ddd-ts-kit list\` for the rest)`
    : text;
}

function contextLine(context) {
  const size = (key) => (context[key] ?? []).length;
  const upstreams =
    (context.upstreams ?? [])
      .map((upstream) => upstream.context ?? upstream)
      .filter((name) => named(name, CONTEXT_NAME))
      .join(', ') || 'none';
  const classification = named(context.classification, CONTEXT_NAME) ?? 'unclassified';

  return `${context.name} [${classification}] upstreams: ${upstreams}; glossary: ${context.glossary ?? 0} terms; ${size('aggregates')} aggregates, ${size('commands')} commands, ${size('queries')} queries, ${size('publishedEvents')} published events`;
}

// Taking one side of a merge erases what the other side added without a conflict: a sub-agent
// resolves each hunk instead. A derived file outside the sources (openapi/, the context map) is
// taken from either side and regenerated, so only the sources and the tests are held.
function oneSideMergeReason(project, input, commands) {
  if (!input.agent_type) {
    return undefined;
  }
  const taken = commands.some(({ words, directory }) => {
    const { subcommand, tail, moved } = gitInvocation(words.slice(1), directory);
    if (call.shell.commandName(words) !== 'git') {
      return false;
    }
    if (['merge', 'pull', 'rebase', 'cherry-pick', 'revert'].includes(subcommand)) {
      return takesOneSide(tail);
    }
    return (
      ['checkout', 'restore'].includes(subcommand) &&
      tail.some((word) => /^--(?:ours|theirs)$/.test(word)) &&
      heldPaths(project, moved, tail)
    );
  });
  return taken
    ? 'Taking one side of a merge (`-X theirs`, `-X ours`, `-s ours`, `checkout` or `restore --theirs/--ours` on a source or a test) erases what the other side added, without a conflict to show it. Bring the trunk in with `npx ddd-ts-kit merge-trunk`: it settles the derived files itself; resolve each hunk it leaves keeping the intent of both sides, `git add` the file, then `npx ddd-ts-kit merge-trunk --continue`, which commits only once no line, row or test is lost.'
    : undefined;
}

// `-X ours|theirs`, `-Xtheirs`, `--strategy-option[=]theirs`, `-s ours`, `--strategy[=]ours`.
function takesOneSide(tail) {
  return tail.some((word, index) => {
    const next = tail[index + 1];
    const option = /^(?:-X|--strategy-option=?)(.*)$/.exec(word);
    const strategy = /^(?:-s|--strategy=?)(.*)$/.exec(word);
    return (
      (option !== null && /^(?:ours|theirs)$/.test(option[1] || next)) ||
      (strategy !== null && (strategy[1] || next) === 'ours')
    );
  });
}

// A path under the source root or the tests, or the whole tree; a place only the shell knows may be either.
function heldPaths(project, directory, args) {
  return call.shell
    .operands(args)
    .map((word) => call.shell.placeOf(word, directory))
    .map((place) => (place === undefined ? '' : projectPath(project, place)))
    .some(
      (path) =>
        path === '' ||
        [project.sourceRoot, 'test', 'tests'].some((root) => path === root || path.startsWith(`${root}/`)),
    );
}

function sharedGeneratorReason(project, context, commands) {
  for (const { subcommand, args } of kitInvocations(commands)) {
    if (subcommand !== 'generate' && subcommand !== 'g') {
      continue;
    }
    const [kind, target] = args.filter((arg) => !arg.startsWith('-'));
    if (kind === 'adr') {
      if (args.includes('--deviation')) {
        return `\`generate adr --deviation\` also writes the deviation in ddd-ts-kit.config.json, which is shared, and relaxing a rule is a decision of the project owner. ${REPORT_TO_CONDUCTOR}`;
      }
      continue;
    }
    if (SHARED_GENERATORS.includes(kind)) {
      return `\`generate ${kind}\` writes shared files (config, registries of the platform, schema). The conductor runs it on the trunk before the workers start. ${REPORT_TO_CONDUCTOR}`;
    }
    if (target && target !== context) {
      return `You build the context "${context}"; \`generate ${kind} ${target}\` writes in another context. ${REPORT_TO_CONDUCTOR}`;
    }
    const aggregate = kind === 'command' ? aggregateOption(args) : undefined;
    if (aggregate && !hasRepository(project, context, aggregate)) {
      return `\`generate command --aggregate ${aggregate}\` would also create the repository of ${aggregate}, which registers in shared files. ${REPORT_TO_CONDUCTOR}`;
    }
  }
  return sharedKitWriteReason(commands);
}

// Other kit commands that write files of every context: `init --force` rewrites the whole project,
// `depcruise-config --write` rewrites the generated dependency rules.
function sharedKitWriteReason(commands) {
  for (const { subcommand, args } of kitInvocations(commands)) {
    if (subcommand === 'init' && args.includes('--force')) {
      return `\`init --force\` rewrites the project from the kit, including files of every context. ${REPORT_TO_CONDUCTOR}`;
    }
    if (subcommand === 'depcruise-config' && args.includes('--write')) {
      return `\`depcruise-config --write\` rewrites the generated .dependency-cruiser.cjs from ${CONFIG}, which is shared. ${REPORT_TO_CONDUCTOR}`;
    }
  }
  return undefined;
}

function aggregateOption(args) {
  const at = args.findIndex((arg) => arg === '--aggregate' || arg.startsWith('--aggregate='));
  return at === -1 ? undefined : args[at].includes('=') ? args[at].split('=')[1] : args[at + 1];
}

// The repository port of an aggregate, at the level of the context or in a module of its model.
function hasRepository(project, context, aggregate) {
  const name = aggregate.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return ['', ...(project.modules[context] ?? [])].some((module) =>
    existsSync(
      join(project.root, project.contextsDir, context, module, 'domain', 'repositories', `${name}.repository.ts`),
    ),
  );
}

// TypeORM takes the path of the migration (`migrations/working-add-claims`): its last segment is the name.
function workingMigrationReason(command) {
  const name = /\bdb:generate(?:\s+--)?\s+([^\s;&|]+)/.exec(command)?.[1]?.split('/').pop();
  return name && !/^working[_-]/.test(name)
    ? `A worker generates a working migration only: \`npm run db:generate working-${name}\`. It lets the specs of the branch run; the conductor deletes it and generates the real one on the trunk at merge.`
    : undefined;
}

// The flags may stand anywhere: `npm i -D zod`, `npm i zod@1 --save-exact`. A clean install stays free.
function dependencyChangeReason(commands) {
  return commands.some(changesDependencies)
    ? `Adding, removing or updating a dependency changes package.json and the lockfile, which are shared. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

function changesDependencies({ words }) {
  const manager = call.shell.commandName(words);
  if (!(manager in DEPENDENCY_CHANGES)) {
    return false;
  }
  const [subcommand, ...rest] = call.shell.operands(words.slice(1), VALUED_MANAGER_OPTIONS);
  if (DEPENDENCY_CHANGES[manager].includes(subcommand)) {
    return true;
  }
  if (
    manager === 'npm' &&
    ((subcommand === 'pkg' && /^(set|delete)$/.test(rest[0])) || (subcommand === 'audit' && rest[0] === 'fix'))
  ) {
    return true;
  }

  return INSTALLS.includes(subcommand) && rest.length > 0;
}

// Another formatter lays the code out otherwise than `format`, and the lint then reports the lines it moved;
// `npx biome` without `--no` can fetch an unrelated package of the registry under that name.
function formatterReason(project, commands) {
  const run = project.packageManager === 'pnpm' ? 'pnpm run' : 'npm run';
  const advice = `Format with \`${run} format\` only, then \`${run} lint:fix\`: a blank line the lint asks for after a line the formatter wrapped is expected.`;
  for (const { words } of commands) {
    const fetched = fetchedPackage(words);
    if (fetched?.name === 'prettier' && formatRunsBiome(project)) {
      return `\`npx prettier\` is not the formatter of this project: its \`format\` script runs Biome. ${advice}`;
    }
    if (fetched?.name === 'biome' && !fetched.installedOnly) {
      return `\`npx biome\` without \`--no\` can run an unrelated package of the registry named biome, which formats nothing. ${advice}`;
    }
  }
  return undefined;
}

// The package a runner fetches (`npx`, `pnpm dlx`, ...), without its version, and whether `--no` keeps it to what is installed.
function fetchedPackage(words) {
  const name = call.shell.commandName(words);
  const fetching = ['npx', 'pnpx', 'bunx'].includes(name) || (['pnpm', 'yarn'].includes(name) && words[1] === 'dlx');
  if (!fetching) {
    return undefined;
  }
  const args = words.slice(name === 'pnpm' || name === 'yarn' ? 2 : 1);
  const named = args[args.findIndex((word) => word === '-p' || word === '--package') + 1];
  const first = call.shell.operands(args, ['-p', '--package', '-c', '--call'])[0];
  const spec = args.some((word) => word === '-p' || word === '--package') ? named : first;
  return spec === undefined
    ? undefined
    : {
        name: spec.replace(/(.)@.*$/, '$1'),
        installedOnly: name === 'npx' && args.some((word) => /^--no(-install)?$/.test(word)),
      };
}

function formatRunsBiome(project) {
  const format = readJson(join(project.root, 'package.json'))?.scripts?.format;
  return typeof format === 'string' && /\bbiome\b/.test(format);
}

// A worker never writes outside its scope, whatever the tool. A file the shell writes by name (a
// redirection, `sed -i`, `perl -i`, `tee`) is held to the checks of a write with the editor tools;
// copies, moves, deletions and restores outside the scope are refused; inline code, whose writes
// cannot be read in advance, is checked after it ran (`pendingChangeReason`).
function fileChangeReason(project, input, commands) {
  for (const command of commands) {
    for (const target of writtenTargets(command)) {
      const refusal = shellWriteReason(project, input, target);
      if (refusal) {
        return refusal;
      }
    }
    const changed = changedPaths(command).find((path) => outsideScope(project, input, path.place));
    if (changed) {
      return `A worker never changes a file outside its scope: \`${changed.by}\` changes ${describePlace(project, changed.place)}. ${EDIT_WITH_TOOLS}`;
    }
    const landing = folderLandingReason(project, input, command);
    if (landing) {
      return landing;
    }
  }
  return undefined;
}

// cp, mv, ln, install and rsync given a folder that exists write under it, not it: a folder of the
// scope is judged by what the command brings into it and by the files it lands on there. A link or a
// whole tree comes from the scope alone; a folder that holds a file with another name elsewhere (a
// hard link), at any depth, takes nothing, since a file landing on that name changes the other one;
// and each file lands where its name leads, through a link if one stands there.
function folderLandingReason(project, input, command) {
  const landing = folderLanding(command);
  if (!landing) {
    return undefined;
  }
  const { name, sources, folder, brings } = landing;
  const into = describePlace(project, folder);
  const foreign = brings ? sources.find((source) => outsideScope(project, input, source.place)) : undefined;
  if (foreign) {
    return `A worker brings no link and no whole tree from outside its scope into it: \`${name}\` brings ${foreign.word.replaceAll(call.shell.UNKNOWN, '$(...)')}, outside your scope, into ${into}. ${REPORT_TO_CONDUCTOR}`;
  }
  // A whole tree, or files whose names only the shell knows, may land on any file of the folder; a
  // file named lands on its name there.
  const linked = landing.anywhere ? multiplyNamed(folder, { left: FOLDER_FILES }) : undefined;
  if (linked === folder) {
    return `${into} holds more files than the guard reads before a command (${FOLDER_FILES}), so it cannot see that none of them has another name elsewhere: \`${name}\` lands no file there. Write the file with the editor tools, or into a smaller folder. ${REPORT_TO_CONDUCTOR}`;
  }
  if (linked) {
    return `${into} holds a file that has another name elsewhere (a hard link), ${projectPath(project, linked)}: what \`${name}\` lands in that folder could change the other file too. ${REPORT_TO_CONDUCTOR}`;
  }
  const landed = sources
    .map(({ word }) => join(folder, basename(word)))
    .find((place) => outsideScope(project, input, place));
  return landed
    ? `A worker never changes a file outside its scope: \`${name}\` changes ${describePlace(project, landed)}. ${EDIT_WITH_TOOLS}`
    : undefined;
}

// The sources and the folder of a command that lands files in a folder that exists, and whether it
// `brings` links or whole trees: `ln` and `rsync` always, `cp` by its options. `install -d` makes folders.
function folderLanding({ words, directory }) {
  const name = call.shell.commandName(words);
  const args = words.slice(1);
  if (!LANDING_COMMANDS.has(name) || (name === 'install' && args.includes('-d'))) {
    return undefined;
  }
  const target = targetDirectory(name, args);
  const valued = name === 'rsync' ? RSYNC_VALUED : PATH_COMMANDS[name].valued;
  const operands = call.shell.operands(args, target === undefined ? valued : [...valued, '-t', '--target-directory']);
  const sources = target === undefined ? operands.slice(0, -1) : operands;
  if (sources.length === 0) {
    return undefined;
  }
  const folder = call.shell.placeOf(target ?? operands.at(-1), directory);
  if (folder === undefined || !isDirectory(folder)) {
    return undefined;
  }
  const placed = sources.map((word) => ({ word, place: call.shell.placeOf(word, directory) }));
  return {
    name,
    folder,
    sources: placed,
    brings: name === 'ln' || name === 'rsync' || (name === 'cp' && args.some((word) => CP_BRINGS.test(word))),
    anywhere:
      name === 'rsync' ||
      (name === 'cp' && args.some((word) => CP_TREE.test(word))) ||
      placed.some(({ word, place }) => place === undefined || /[*?[]/.test(word) || isDirectory(place)),
  };
}

function shellWriteReason(project, input, { place, by }) {
  if (place === undefined) {
    return `A worker writes with the shell only to a file it names: ${by} writes files only the shell knows. ${EDIT_WITH_TOOLS}`;
  }
  const owner = findProject(place);
  if (owner === undefined) {
    return `A worker writes only inside its worktree: ${by} writes ${place}, outside your worktree. ${FREE_OUTPUT}`;
  }
  if (owner.root !== project.root) {
    return `A worker never changes a file outside its scope: ${by} writes ${place}, in another checkout. ${EDIT_WITH_TOOLS}`;
  }
  const refusal =
    generatedFileReason(project, place) ??
    workerScopeReason(project, place, input) ??
    linkReason(project, place, input) ??
    handWrittenRoleReason(project, place);

  return refusal ? `${by}: ${refusal} ${FREE_OUTPUT}` : undefined;
}

// A path only the shell knows, of another checkout, or anywhere outside every kit project but the
// free devices and the temporary directory, is outside the worker's scope.
function outsideScope(project, input, place) {
  if (place === undefined) {
    return true;
  }
  const owner = findProject(place);
  if (owner === undefined) {
    return !isFreePlace(place);
  }

  return (
    owner.root !== project.root ||
    (workerScopeReason(project, place, input) ?? linkReason(project, place, input)) !== undefined
  );
}

// The code a worker's command runs (inline code, a script, a shell fed on its input, a test or a
// package script) cannot be read in advance: unless every command of the line is a pure reader, the
// state outside the scope is noted before it, and compared at the next call of the guard by that
// worker (`settleNote`). The kit's own merge of the trunk, which brings the trunk's files in, is not
// noted; nor are the packages around an install, which rewrites them.
function noteBeforeCode(project, input, commands) {
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
function pendingChangeReason(project, input, commands) {
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
function settleNote(project, input, reading) {
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

function heldChangeReason(project, input, commands) {
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

function isChecked(file) {
  return /\.(ts|mts|cts)$/.test(file) || file.endsWith('CONTEXT.md');
}

function hasPendingChanges(project) {
  const status = gitRun(project, ['status', '--porcelain']);
  return status.status !== 0 || status.stdout.trim().length > 0;
}

// Said once per session while the tree stays above the limits; a session start says it again.
function commitReminder(project, input, { repeat }) {
  const changes = (uncommittedChanges(project) ?? []).filter((change) => !isDerived(project, change.path));
  const lines = changes.reduce((sum, change) => sum + change.lines, 0);
  const marker = reminderMarker(project, input);
  if (changes.length <= project.commit.maxFiles && lines <= project.commit.maxLines) {
    return forget(marker);
  }
  if (alreadyRemembered(marker) && !repeat) {
    return undefined;
  }

  return `ddd-ts-kit: ${changes.length} changed files and ${lines} changed lines are uncommitted (advised at most ${project.commit.maxFiles} files and ${project.commit.maxLines} lines a commit, generated files not counted). Commit each finished slice on its own, with the files its generator wrote: ${describeSlices(project, changes)}. See the skill ddd-ts-kit:commit-discipline.`;
}

function uncommittedChanges(project) {
  const untracked = git(project, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked === undefined) {
    return undefined;
  }
  const tracked = (git(project, ['diff', '--numstat', '--no-renames', '--relative', '-z', 'HEAD']) ?? '')
    .split('\0')
    .filter(Boolean)
    .map(numstatChange);
  const fresh = untracked
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ path, lines: lineCount(join(project.root, path)) }));

  return [...tracked, ...fresh];
}

function numstatChange(entry) {
  const [added, deleted, ...path] = entry.split('\t');
  return { path: path.join('\t'), lines: (Number(added) || 0) + (Number(deleted) || 0) };
}

// Read within its bound: a file larger, or that cannot be opened (a broken link, a device), counts no line.
function lineCount(file) {
  const { content } = readBounded(file, COUNTED_FILE_BYTES);
  return content === undefined
    ? 0
    : content.split('\n').filter((line, index, all) => index < all.length - 1 || line !== '').length;
}

function isDerived(project, path) {
  return (
    DERIVED_FILES.includes(path) || GENERATED_DOCUMENT.test(path) || isBarrel(project, path) || path === WORKER_SCOPE
  );
}

function describeSlices(project, changes) {
  const sizes = new Map();
  for (const { path } of changes) {
    sizes.set(sliceOf(project, path), (sizes.get(sliceOf(project, path)) ?? 0) + 1);
  }
  const slices = [...sizes]
    .sort(([, left], [, right]) => right - left)
    .map(([slice, files]) => `${slice} (${files} files)`);

  return slices.length > 8 ? `${slices.slice(0, 8).join(', ')} and ${slices.length - 8} more` : slices.join(', ');
}

// A slice is a use case of a context: its folder, its route and their specs travel together.
function sliceOf(project, path) {
  const inside = insideContexts(project, path);
  if (!inside) {
    return path.startsWith(`${project.platformDir}/`)
      ? 'platform'
      : path.includes('/')
        ? path.split('/')[0]
        : 'project root';
  }
  const [context, ...parts] = inside;
  // A module of the model holds its layers: a use case sits below it.
  const [layer, kind, useCase] = outsideItsModule(project, context, parts);
  if (layer === 'application' && (kind === 'commands' || kind === 'queries') && useCase) {
    return `${context}: ${useCase}`;
  }
  const named = /\/([^/.]+)\.(?:route|handler\.spec|route\.spec)\.ts$/.exec(path)?.[1];

  return named ? `${context}: ${named}` : `${context}: ${kind === undefined ? 'context files' : layer}`;
}
