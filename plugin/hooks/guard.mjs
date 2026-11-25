#!/usr/bin/env node
// Fails open by design: a guard that breaks must never block the work it guards.
// The entry of the guard: the mode a hook asks for and, for each mode, the order in which the rules are
// asked. What the rules read and decide lies in the modules beside this file, each opening with what
// it holds, all loaded with it whatever the mode; the reader of the shell (shell-commands.mjs) and the
// runs of a builder (builder-runs.mjs) alone are loaded when a call needs them.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { planPointer, projectBriefing } from './briefing.mjs';
import { call } from './call.mjs';
import { isRecord, readJson } from './disk.mjs';
import { git, unreadRepositoryNotice } from './git.mjs';
import { pruneGuardState, saidOnce, sharedStateFile, stateFile } from './guard-state.mjs';
import { branchOutsideReason, heldChangeReason, pendingChangeReason, settleNote } from './held-changes.mjs';
import {
  decide,
  emit,
  hostOf,
  isBuilder,
  isWorkerAgent,
  patchWrites,
  readInput,
  toolInput,
  writesOf,
} from './hook-input.mjs';
import { removeKitFile } from './kit-files.mjs';
import {
  baselineFileRule,
  generatedFileRule,
  handWrittenRoleRule,
  scopeFileRule,
  scopeLinkRule,
  storyCodeRule,
  testWriterScopeRule,
  workerScopeRule,
  worktreeCodeRule,
} from './place-rules.mjs';
import {
  ANSWER_BYTES,
  decisionOf,
  describe,
  errorsOf,
  findProject,
  FORMATTED_FILE,
  insideContexts,
  installedBin,
  projectPath,
  runCli,
  TIME_SCALE,
} from './project.mjs';
import { commitReminder, designReminder, hasPendingChanges } from './reminders.mjs';
import { hasWorkerWorktree, STORY_SCOPE, WORKER_SCOPE } from './repository.mjs';
import { firstRefusal } from './rule-table.mjs';
import {
  AWK_PROGRAMS,
  CODE_RUNNERS,
  NEUTRAL_PROGRAMS,
  PURE_READERS,
  READING_PROGRAMS,
  RUNNING_PROGRAMS,
} from './shell-reads.mjs';
import {
  builderStrayRefusal,
  isHeldToAWorktree,
  preparingRefusal,
  sessionShellRefusal,
  workerCommandRefusal,
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
  isUnwrapping,
  unfinishedStoryReason,
  writtenProjectPaths,
} from './story-rules.mjs';
import {
  commandDirectory,
  readPin,
  releasePin,
  REPORT_TO_CONDUCTOR,
  strayWriteReason,
  withPinnedMode,
  workerContext,
  workerScope,
} from './worker-scope.mjs';
import { dependencyReason, escapeReason, governedFileReason, scriptsChangeReason } from './write-rules.mjs';

const FORMAT_TIMEOUT = 5000;

// What a session start gives the CLI in all, of the 15 s of its hook: past it, the calls left are skipped.
const BRIEFING_BUDGET = 10_000;

// The written files one call of post-write checks, of the 15 s of its hook: a patch of Codex can hold many.
const POST_WRITE_FILES = 5;
// The written files one call of pre-write has the CLI judge before they land, of the 5 s of its hook.
const CLI_WRITE_FILES = 2;

// The files a compiler, a linter or a test runner reads a suppression from: in Markdown or YAML the
// same words are prose, a constitution or a decision record that names the rule they break.
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;

const UNREADABLE_COMMAND = `The guard could not read this command, and a worker runs none it cannot read: write it as shorter, separate commands. ${REPORT_TO_CONDUCTOR}`;

// What a sub-agent unwrapping a scenario writes is judged by the rules before: a worker's scope does not hold it.
const notUnwrapping = ({ project, file, input }) => !isUnwrapping(project, file, input);

// The rules on a file written that start no process, in the order they are asked.
const WRITE_RULES = [
  baselineFileRule,
  scopeFileRule,
  {
    id: 'acceptance',
    reason: ({ project, input, file, written, replaced }) =>
      acceptanceReason(project, input, { file, written, replaced }),
  },
  generatedFileRule,
  { ...workerScopeRule, applies: notUnwrapping },
  { ...scopeLinkRule, applies: notUnwrapping },
  { id: 'stray-write', reason: ({ project, input }) => strayWriteReason(project, input) },
  testWriterScopeRule,
  worktreeCodeRule,
  handWrittenRoleRule,
];

// A file a patch removes is judged as `rm` judges it: the baseline and the scope of a worker hold it.
const REMOVAL_RULES = [baselineFileRule, workerScopeRule];

// The rules the CLI decides, on a file it may judge before the write.
const CLI_RULES = [
  storyCodeRule,
  {
    id: 'dependency',
    reason: ({ project, file, written, replaced, input }) =>
      dependencyReason(project, { file, written, replaced }, input),
  },
];

// The questions a write puts, when no rule refuses it.
const DEVIATION_RULES = [
  { id: 'governed-file', reason: ({ project, file }) => governedFileReason(project, file) },
  { id: 'scripts-change', reason: ({ project, file, input }) => scriptsChangeReason(project, file, input) },
  {
    id: 'escape',
    applies: ({ file }) => SCRIPT_FILE.test(file),
    reason: ({ written, replaced }) => escapeReason(written, replaced),
  },
];

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
    decide(input, verdict);
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
    decision: decisionOf(home),
    id: 'stray-file',
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
  return pending?.reason ? { decision: decisionOf(project), id: 'held-changes', reason: pending.reason } : undefined;
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
    const refusal = check(written, input);
    if (refusal && written.project.mode !== 'advise') {
      return { decision: 'deny', ...refusal };
    }
    asked ??= refusal ? { decision: 'ask', ...refusal } : undefined;
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

function quickRefusal(written, input) {
  return firstRefusal(written.deleted ? REMOVAL_RULES : WRITE_RULES, { ...written, input });
}

function cliRefusal(written, input) {
  return firstRefusal(CLI_RULES, { ...written, input });
}

function deviationOf(written, input) {
  const deviation = written.deleted ? undefined : firstRefusal(DEVIATION_RULES, { ...written, input });
  return deviation ? { decision: 'ask', ...deviation } : undefined;
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
    decide(input, verdict);
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
  const decision = decisionOf(project);
  const commands = readCommands(project, command, cwd);
  if (!commands) {
    return isHeldToAWorktree(project, input)
      ? { decision, id: 'unreadable-command', reason: UNREADABLE_COMMAND }
      : undefined;
  }
  const preparing = preparingRefusal(project, input, { command, commands });
  if (preparing) {
    return { decision, ...preparing };
  }
  const context = workerContext(project, input);
  const refusal = context
    ? workerCommandRefusal(project, input, { context, command, commands })
    : (builderStrayRefusal(project, input, commands) ?? sessionShellRefusal(input, commands));
  return refusal ? { decision, ...refusal } : undefined;
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
          decision: decisionOf(project),
          id: 'patch-in-the-command',
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

  return saidOnce(project, input, 'stop', describe(errors));
}

function blockStop(errors) {
  emit({
    decision: 'block',
    reason: `ddd-ts-kit: ${errors.length} architecture error(s) remain. Fix them before finishing, do not suppress or lower a severity.\n${describe(errors.slice(0, 10))}`,
  });
}

function isChecked(file) {
  return /\.(ts|mts|cts)$/.test(file) || file.endsWith('CONTEXT.md');
}
