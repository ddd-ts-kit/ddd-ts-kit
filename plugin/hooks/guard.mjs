#!/usr/bin/env node
// Fails open by design: a guard that breaks must never block the work it guards.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { call } from './call.mjs';
import { isRecord, readJson, readText } from './disk.mjs';
import { git, unreadRepositoryNotice } from './git.mjs';
import { alreadyRemembered, markerOf, pruneGuardState, sharedStateFile, stateFile } from './guard-state.mjs';
import { branchOutsideReason, heldChangeReason, pendingChangeReason, settleNote } from './held-changes.mjs';
import { decide, emit, hostOf, patchWrites, readInput, sessionOf, toolInput, writesOf } from './hook-input.mjs';
import { removeKitFile } from './kit-files.mjs';
import {
  ANSWER_BYTES,
  CLEAN_INSTALL,
  CONFIG,
  CONFIG_BYTES,
  describe,
  errorsOf,
  findProject,
  FORMATTED_FILE,
  GUARD_MODES,
  insideContexts,
  installedBin,
  projectPath,
  runCli,
  TIME_SCALE,
} from './project.mjs';
import { commitReminder, designReminder, hasPendingChanges } from './reminders.mjs';
import { gitDirOf, hasWorkerWorktree, STORY_SCOPE, WORKER_SCOPE } from './repository.mjs';
import { ABSOLUTE_PATH, AGENT_ID, CONTEXT_NAME, GIT_REF, LABEL, named, quoted, STORY_ID } from './said-as-data.mjs';
import {
  AWK_PROGRAMS,
  CODE_RUNNERS,
  NEUTRAL_PROGRAMS,
  PURE_READERS,
  READING_PROGRAMS,
  RUNNING_PROGRAMS,
} from './shell-reads.mjs';
import {
  builderStrayReason,
  isHeldToAWorktree,
  preparingReason,
  sessionShellReason,
  workerCommandReason,
} from './shell-rules.mjs';
import {
  ACCESS_COMMANDS,
  changedPaths,
  DOWNLOAD_FLAGS,
  IN_PLACE_EDITORS,
  isFreePlace,
  PATH_COMMANDS,
  TOOL_WRITES,
  writtenTargets,
} from './shell-writes.mjs';
import {
  acceptanceReason,
  crossingNotice,
  fixOf,
  isUnwrapping,
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
  generatedFileReason,
  governedFileReason,
  handWrittenRoleReason,
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

// The files a compiler, a linter or a test runner reads a suppression from: in Markdown or YAML the
// same words are prose, a constitution or a decision record that names the rule they break.
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;

const UNREADABLE_COMMAND = `The guard could not read this command, and a worker runs none it cannot read: write it as shorter, separate commands. ${REPORT_TO_CONDUCTOR}`;

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

function isChecked(file) {
  return /\.(ts|mts|cts)$/.test(file) || file.endsWith('CONTEXT.md');
}
