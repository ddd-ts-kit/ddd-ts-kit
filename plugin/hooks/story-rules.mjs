// The rules of a story and of a fix: the acceptance tests, their lock and their verdict, the build gate
// of the code, the worktree a story is built in, and what a write meets of the other open stories.
// Read by session, pre-write, pre-bash and stop.
import { createHash } from 'node:crypto';
import { existsSync, globSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { call } from './call.mjs';
import { isDirectory, readJson, readText } from './disk.mjs';
import { gitRun } from './git.mjs';
import { GUARD_STATE, saidOnce, writeState } from './guard-state.mjs';
import { isJudge, isSubAgent } from './hook-input.mjs';
import { CLEAN_INSTALL, insideContexts, projectPath, runCli, SPEC_FILE, TEST_DIRECTORY } from './project.mjs';
import { repositoryTop, STORY_SCOPE } from './repository.mjs';
import { ABSOLUTE_PATH, GIT_REF, named, quoted, STORY_ID } from './said-as-data.mjs';
import {
  AWK_PROGRAMS,
  GIT_READS,
  gitInvocation,
  isPureReader,
  kitInvocations,
  kitReads,
  NEUTRAL_PROGRAMS,
  READING_PROGRAMS,
  RUNNING_PROGRAMS,
  runsAProgramOfGit,
} from './shell-reads.mjs';
import { changedPaths, inPlaceFlag, runsInlineCode, sedWrites, writtenTargets } from './shell-writes.mjs';
import { REPORT_TO_CONDUCTOR, workerScope } from './worker-scope.mjs';

// Where the worktrees of a project live, inside it, ignored by git and by every tool.
const WORKTREES_DIR = '.worktrees';
// How long the guard keeps what `stories --json` said before reading it again.
const STORIES_TTL = 60_000;

// The files a merge of two stories settles by their kind: no story is warned of them.
const SETTLED_BY_MERGE =
  /(^|\/)(docs\/architecture\/slices\.md|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|stored-events\.lock\.json)$/;
// What the build gate of a story reads: when none of them changed, a gate once met stays met.
const STORY_INPUTS = [
  'docs/architecture/slices.md',
  'docs/architecture/stories',
  'docs/architecture/reviews',
  'test/acceptance',
];

// The acceptance of a story and its lock: a sub-agent only unwraps a scenario its rows now satisfy.
const ACCEPTANCE_SPEC = /^test\/acceptance\/[^/]+\.acceptance\.spec\.ts$/;
const ACCEPTANCE_LOCK = /^test\/acceptance\/[^/]+\.acceptance\.lock\.json$/;
// The verdicts that let a locked acceptance change: written by the acceptance-judge agent alone.
const ACCEPTANCE_VERDICT = /^test\/acceptance\/verdicts\/[^/]+\.md$/;

// The scope files of the story worktrees this run has read, by project root.
const storyScopes = new Map();

// The session of a story ends on its report: written once the pull request is open, or with what
// blocks the story. Refused once for the same step, so that a session that cannot go on still stops.
export function unfinishedStoryReason(project, input) {
  const story = storyOf(project);
  if (story === undefined || !project.cli) {
    return undefined;
  }
  const phases = runCli(project, ['story', story, '--json'], 8000);
  const report = phases?.phases?.find(({ id }) => id === 'report');
  if (!report || report.met) {
    return undefined;
  }
  if (typeof input.stop_hook_active !== 'boolean' && saidOnce(project, input, 'story', phases.next)) {
    return undefined;
  }
  return `ddd-ts-kit: story ${story} is not finished. Next: ${quoted(phases.next)} Go on without asking: a question now is a provisional decision, recorded in docs/architecture/stories/${story}.md. If something truly blocks the story, write its \`## Report\` there with what blocks it and every decision taken so far, then stop.`;
}

// The story of the worktree, by an id the CLI would take.
export function storyOf(project) {
  return named(storyScope(project)?.story, STORY_ID);
}

// The scope file of a story worktree, read once a run like the config.
function storyScope(project) {
  if (!storyScopes.has(project.root)) {
    storyScopes.set(project.root, readJson(join(project.root, STORY_SCOPE)));
  }
  return storyScopes.get(project.root);
}

// The acceptance of a story is the contract its code is built against: its lock is written by the
// CLI only, which refuses a scenario changed without its criterion unless a reason is kept for the
// owner; a sub-agent never rewrites a scenario, it removes `pending(...)` once its rows pass it.
export function acceptanceReason(project, input, { file, written, replaced }) {
  const path = projectPath(project, file);
  const judging = isJudge(input);
  if (judging || path.startsWith('test/acceptance/verdicts/')) {
    return judging === ACCEPTANCE_VERDICT.test(path) ? undefined : verdictReason(judging, path);
  }
  const held = lockedRegressionReason(project, path, input);
  if (held) {
    return held;
  }
  if (ACCEPTANCE_LOCK.test(path)) {
    return `${path} is the lock of a story's acceptance: \`npx ddd-ts-kit acceptance <story> --lock\` writes it, and refuses a change since the lock that no verdict of the acceptance-judge agent lets through.`;
  }
  if (!ACCEPTANCE_SPEC.test(path) || !isSubAgent(input)) {
    return undefined;
  }
  const before = replaced.trim() === '' ? (readText(file) ?? '') : replaced;
  return existsSync(file) && asserted(written) === asserted(before)
    ? undefined
    : `${path} is the acceptance of a story, locked with its specification: a sub-agent only removes \`pending(...)\` around a scenario its rows now satisfy. A scenario that seems wrong is not changed to pass: name it and the criterion it fails in your report, and the conductor has the acceptance-judge agent judge it before anything changes. ${REPORT_TO_CONDUCTOR}`;
}

// The fix of the worktree, when its story.json says `kind: 'fix'` (absent, a story): its code, whether
// its lock is written, and the regression specs the lock lists, relative to the project.
export function fixOf(project) {
  const story = storyOf(project);
  if (story === undefined || storyScope(project).kind !== 'fix') {
    return undefined;
  }
  const lock = join(project.root, 'test/acceptance', `${story.toLowerCase()}.acceptance.lock.json`);
  const files = (readJson(lock)?.regression ?? []).map((test) => test?.file).filter((file) => typeof file === 'string');
  return { story, locked: existsSync(lock), files: [...new Set(files)] };
}

// The regression spec of a fix, once locked, is the proof of the fix: a sub-agent never rewrites it. The
// main session of the fix may write a new version, as the main session of a story writes its acceptance:
// `acceptance <fix>` then reports the change since the lock, `--lock` refuses it until the acceptance-judge
// agent has ruled on that very version, and a change of layout alone (the fingerprint ignores white space)
// needs no verdict.
export function lockedRegressionReason(project, path, input) {
  const fix = fixOf(project);
  return fix?.files.includes(path) && isSubAgent(input)
    ? `${path} is a regression spec of fix ${fix.story}, locked: it is the proof of the fix, and a sub-agent does not change it. Fix the code instead, and if the spec seems wrong, name it and the statement it fails in your report: the main session of the fix writes a new version, runs \`npx ddd-ts-kit acceptance ${fix.story}\` (it reports the change since the lock with its subject and fingerprint), has the acceptance-judge agent rule on it with the statement of the fix (\`## Statement\` of docs/architecture/stories/${fix.story}.md) as the criterion, and locks again with \`--lock\` once the verdict is \`amend\`. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

function verdictReason(judging, path) {
  return judging
    ? `The acceptance judge writes its verdict and nothing else: test/acceptance/verdicts/<story>-<fingerprint>.md, not ${path}.`
    : `${path} is a verdict on a locked acceptance: the acceptance-judge agent alone writes it, so that a session never lets its own change through. Launch that agent with the subject and the fingerprint \`npx ddd-ts-kit acceptance <story>\` prints.`;
}

// Outside the judge, a command that names the lock or a verdict only reads it, versions it or runs the kit;
// the judge itself only reads, and writes its verdict with the editor tool. A command that names a locked
// regression spec of a fix may also run it, with a test runner; a sub-agent never rewrites it (the main session may).
export function acceptanceFilesShellReason(project, input, { command, commands }) {
  const judging = isJudge(input);
  const written = writtenProjectPaths(project, commands);
  const fixFiles = isSubAgent(input) ? (fixOf(project)?.files ?? []) : [];
  // Where only the shell knows the place, any held file may be it.
  const unnamed = fixFiles.length > 0 && writtenPlaces(commands).includes(undefined);
  // A command touches a held file by a place it writes (a glob expanded, a folder that holds the file)
  // or by naming it in text.
  const held = fixFiles.filter(
    (file) =>
      unnamed ||
      written.some((path) => holdsFile(path, file)) ||
      command.includes(file) ||
      command.includes(file.split('/').pop()),
  );
  // The lock and the verdicts, a folder that holds them, or a place only the shell knows on a line
  // that names the acceptance.
  const governed =
    written.some(isAcceptanceRecord) ||
    /acceptance\/verdicts|\.acceptance\.lock\.json/.test(command) ||
    (writtenPlaces(commands).includes(undefined) && command.includes('acceptance'));
  if (!judging && held.length === 0 && !governed) {
    return undefined;
  }
  if (!commands.some((simple) => isWriting(simple, { holding: held.length > 0, judging }))) {
    return undefined;
  }
  if (judging) {
    return 'The acceptance judge reads (git, cat, grep, the kit) and writes its verdict with the Write tool only.';
  }
  const [spec] = held;
  return spec === undefined
    ? 'The lock of an acceptance and its verdicts are written by `npx ddd-ts-kit acceptance <story> --lock` and by the acceptance-judge agent only; a command may read them, version them or run the kit.'
    : `${unnamed ? 'This command writes places only the shell knows: name each file. ' : ''}${lockedRegressionReason(project, spec, input)} A command may read it, version it or run it (\`npm test -- ${spec}\`).`;
}

function isAcceptanceRecord(path) {
  return (
    ACCEPTANCE_LOCK.test(path) ||
    path.startsWith('test/acceptance/verdicts/') ||
    ['test', 'test/acceptance', 'test/acceptance/verdicts'].includes(path)
  );
}

// A command that writes, its redirections and the places its writers name included: anything but a
// reader, or a test run or a read of a held spec. The judge runs the kit only to read.
function isWriting(simple, { holding, judging }) {
  const reads = judging ? readsOnly(simple) && judgeReads(simple) : readsOnly(simple);
  return (
    !(reads || (holding && (runsTests(simple) || readsAFile(simple)))) ||
    changedPaths(simple).length > 0 ||
    simple.redirects.some(({ operator, target }) => operator.includes('>') && target !== '/dev/null')
  );
}

// What the judge runs reads: git only through the subcommands that read, the kit only to read.
function judgeReads(simple) {
  const invocations = kitInvocations([simple]);
  if (invocations.length > 0) {
    return invocations.every(kitReads);
  }
  return call.shell.commandName(simple.words) !== 'git' || isPureReader(simple);
}

// Whether the path a command writes is `file`, or a folder that holds it (`.../{}`: what `find` finds under a folder).
export function holdsFile(path, file) {
  const folder = path.replace(/(?:^|\/)\{\}$/, '');
  return folder === '' || file === folder || file.startsWith(`${folder}/`);
}

// A reader of the pure list, which writes nothing by its options either: `find -delete` does.
function readsAFile(simple) {
  return isPureReader(simple) && changedPaths(simple).length === 0;
}

// The places a command writes, by name, and the folders `find -exec` hands to a program the guard
// does not read as a writer; undefined where only the shell knows the place.
function writtenPlaces(commands) {
  return commands
    .flatMap((command) => [...writtenTargets(command), ...changedPaths(command), ...foundPlaces(command)])
    .map(({ place }) => place);
}

function foundPlaces(simple) {
  if (!simple.found || readsOnly(simple) || isPureReader(simple)) {
    return [];
  }
  return simple.words
    .filter((word) => word.includes('{}'))
    .map((word) => ({ place: call.shell.placeOf(word, simple.directory) }));
}

// The project paths a command writes, each glob expanded against the tree so a pattern that names a
// lock, a verdict or a held regression spec is seen, not only a path spelled out in the command.
export function writtenProjectPaths(project, commands) {
  const paths = new Set();
  for (const place of writtenPlaces(commands).filter((written) => written !== undefined)) {
    for (const file of expandGlob(project, place)) {
      paths.add(projectPath(project, file));
    }
  }
  return [...paths];
}

// A pattern is walked inside the project only: one that starts outside it stays as written.
function expandGlob(project, place) {
  // A pattern matching nothing (globSync returns []) writes no file, so it protects nothing.
  return /[*?[]/.test(place) && place.startsWith(`${project.root}${sep}`) ? globSync(place) : [place];
}

// A command that writes no file by itself, its redirections aside: a neutral one (`cd`, `test`), a reader,
// `sed` without an in-place edit nor a script that writes, `awk` whose program writes nothing, `less` without a log.
function readsOnly(simple) {
  const { words } = simple;
  const name = call.shell.commandName(words);
  const args = words.slice(1);
  if (name === 'rg') {
    return !args.some((word) => word.startsWith('--pre'));
  }
  if (NEUTRAL_PROGRAMS.has(name) || READING_PROGRAMS.has(name)) {
    return true;
  }
  if (name === 'git') {
    const { subcommand, tail } = gitInvocation(args, undefined);
    const all = subcommand === 'commit' && tail.some((word) => /^-[^-]*a/.test(word) || word === '--all');
    return GIT_READS.has(subcommand) && !all && !words.some(runsAProgramOfGit) && simple.assigned.length === 0;
  }
  // `npx ddd-ts-kit ...`, `pnpm exec ddd-ts-kit ...`: a launcher of the kit reads the lock; `npx`
  // of anything else can write it.
  if (kitInvocations([{ words }]).length > 0) {
    return true;
  }
  if (name === 'sed') {
    return !inPlaceFlag(args) && !sedWrites(args);
  }
  if (AWK_PROGRAMS.has(name)) {
    return !args.some(
      (word) => /^(?:-[a-zA-Z]*[fEil]|--(?:file|exec|include|load))/.test(word) || /[>|@]|\bsystem\b/.test(word),
    );
  }
  return name === 'less' && !args.some((word) => /^(?:-[a-zA-Z]*[oO]|--log-file|--LOG-FILE)/.test(word));
}

// A test runner, however it is launched, as long as it runs no inline code of its own.
function runsTests(simple) {
  return RUNNING_PROGRAMS.has(call.shell.commandName(simple.words)) && !runsInlineCode(simple);
}

// What a scenario asserts, the wrapper `pending(...)`, white space, parentheses and commas aside.
function asserted(text) {
  return text.replace(/\bpending\b/g, '').replace(/[\s(),]/g, '');
}

// A sub-agent unwrapping a scenario writes outside its context: what it writes was judged above.
// A worker that strayed from its worktree unwraps nothing there.
export function isUnwrapping(project, file, input) {
  return isSubAgent(input) && ACCEPTANCE_SPEC.test(projectPath(project, file)) && !workerScope(project, input)?.away;
}

export function acceptanceLockingReason(input, commands) {
  if (!isSubAgent(input)) {
    return undefined;
  }
  const locking = kitInvocations(commands).some(
    ({ subcommand, args }) => subcommand === 'acceptance' && args.includes('--lock'),
  );
  return locking
    ? 'Locking the acceptance of a story is a step of the conductor, once each change since the lock has its verdict. Report the scenario and the criterion it fails instead.'
    : undefined;
}

// In the worktree of a story, the code of a context waits until each row has its design review and
// the acceptance is written and locked (`ddd-ts-kit story --gate build`); the glossary of a context
// is part of the specification and stays open.
export function storyCodeReason(project, file) {
  const path = projectPath(project, file);
  if (!insideContexts(project, path) || /(^|\/)CONTEXT\.md$/.test(path)) {
    return undefined;
  }
  // The proof of a fix, a spec inside the context, is written before its code.
  if (isTestPath(path) && fixOf(project) !== undefined) {
    return undefined;
  }
  return storyBuildReason(project);
}

/** A file under a test directory, or a spec next to the code: where the proof of a fix lives. */
function isTestPath(path) {
  return TEST_DIRECTORY.test(path) || SPEC_FILE.test(path);
}

// The code of a context is written in a worktree: the main checkout of the trunk refuses it
// (unless the config only advises it), and so does a worktree of .worktrees/ without its own
// dependencies, whose Node would resolve the packages of the main checkout above it.
export function worktreeCodeReason(project, file) {
  const path = projectPath(project, file);
  if (!insideContexts(project, path) || /(^|\/)CONTEXT\.md$/.test(path)) {
    return undefined;
  }
  return worktreePlaceReason(project);
}

// A generator of code run where the code may not be written yet: before the build gate of a
// story, in the main checkout of the trunk, in a worktree without its own install.
export function generatorPlaceReason(project, commands) {
  return storyGeneratorReason(project, commands) ?? worktreeGeneratorReason(project, commands);
}

// A fix writes its spec first: the generators of test files stay open before its lock.
function storyGeneratorReason(project, commands) {
  const aside =
    fixOf(project) === undefined ? ['acceptance', 'adr'] : ['acceptance', 'adr', 'builder', 'test-world', 'e2e'];
  return generates(commands, aside) ? storyBuildReason(project) : undefined;
}

// A run of a generator of the kit among `commands`, any kind but those given, its help and its dry run aside.
export function generates(commands, aside) {
  return kitInvocations(commands).some(
    ({ subcommand, args }) =>
      ['generate', 'g'].includes(subcommand) &&
      args[0] !== undefined &&
      !aside.includes(args[0]) &&
      !args.includes('--help') &&
      !args.includes('--dry-run'),
  );
}

function worktreeGeneratorReason(project, commands) {
  return generates(commands, ['acceptance', 'adr', 'context', 'module']) ? worktreePlaceReason(project) : undefined;
}

function worktreePlaceReason(project) {
  if (borrowsDependencies(project)) {
    return `${project.root} is a worktree of ${WORKTREES_DIR}/ without its own node_modules: Node would resolve the packages of the main checkout above it, the versions of the trunk. Install it first: \`cd ${project.root} && ${CLEAN_INSTALL[project.packageManager]}\`.`;
  }
  const branch = project.worktrees === 'required' ? trunkCheckoutBranch(project) : undefined;
  return branch
    ? `This is the main checkout of the trunk (branch ${branch}): the code of a context is written in a worktree. Open one with \`npx ddd-ts-kit worktree <name>\` (a story: \`npx ddd-ts-kit story-scope <code>\`; a plan of several workers: skill ddd-ts-kit:parallel-work), then work there, every command \`cd <worktree> && ...\` and every file by its absolute path under it. \`"worktrees": "advised"\` in the config lifts this refusal.`
    : undefined;
}

// At session start: where the code of the contexts is written, when it is not here.
export function worktreeNotice(project) {
  if (borrowsDependencies(project)) {
    return [worktreePlaceReason(project)];
  }
  const branch = trunkCheckoutBranch(project);
  if (!branch) {
    return [];
  }
  const where = `Main checkout of the trunk (branch ${branch}): the code of the contexts is written in a worktree`;
  const how =
    'open one with `npx ddd-ts-kit worktree <name>` (a story: `npx ddd-ts-kit story-scope <code>`) and work there.';
  return [project.worktrees === 'required' ? `${where}, refused here; ${how}` : `${where}; ${how}`];
}

function borrowsDependencies(project) {
  return project.root.split(sep).includes(WORKTREES_DIR) && !existsSync(join(project.root, 'node_modules'));
}

// The branch of the main checkout of its repository holding the project, when that branch is the
// trunk (the one origin/HEAD names, else main or master) and has a commit: read from .git, no git
// process. A linked worktree has a .git file, not a folder.
function trunkCheckoutBranch(project) {
  const top = repositoryTop(project.root);
  const git = top && join(top, '.git');
  if (!git || !isDirectory(git)) {
    return undefined;
  }
  const branch = /^ref: refs\/heads\/(.+)$/m.exec(readText(join(git, 'HEAD'), ''))?.[1];
  const remote = /^ref: refs\/remotes\/origin\/(.+)$/m.exec(readText(join(git, 'refs/remotes/origin/HEAD'), ''))?.[1];
  const trunk = remote ? branch === remote : ['main', 'master'].includes(branch);
  const born =
    existsSync(join(git, 'refs/heads', branch ?? '')) ||
    readText(join(git, 'packed-refs'), '').includes(` refs/heads/${branch}\n`);
  return trunk && born ? branch : undefined;
}

// In the worktree of a story, a write to a file another open story changes too, or that merging
// its branch would leave to a person: said once per session, file and story, without refusing it.
export function crossingNotice(project, input, file) {
  const stories = storiesOf(project);
  const own = stories?.view.here;
  if (own === undefined) {
    return undefined;
  }
  const path = `${stories.prefix}${projectPath(project, file)}`;
  if (SETTLED_BY_MERGE.test(path)) {
    return undefined;
  }
  const lines = stories.view.stories
    .filter((other) => other.story !== own)
    .map((other) => ({ other, forYou: forYouWith(stories.view, own, other) }))
    .filter(({ other, forYou }) => other.files.includes(path) || forYou.includes(path))
    .filter(({ other }) => !saidOnce(project, input, 'crossing', `${path}\n${other.story}`))
    .map(({ other, forYou }) => crossingLine(other, forYou, path));
  return lines.length === 0
    ? undefined
    : `${lines.join(' ')} Keep the change to what the row needs; \`npx ddd-ts-kit stories\` says where the stories meet, and the report records which one lands first.`;
}

// The files merging the branch of another story into this one now leaves to a person.
function forYouWith(view, own, other) {
  const crossing = view.crossings.find(({ stories }) => stories[0] === own && stories[1] === other.story);
  return (crossing?.merge?.byHand ?? []).map(({ file }) => file);
}

function crossingLine(other, forYou, path) {
  const [story, branch] = [named(other.story, STORY_ID), named(other.branch ?? 'detached', GIT_REF)];
  const worktree = named(other.worktree, ABSOLUTE_PATH);
  const where =
    story === undefined || branch === undefined
      ? 'Another open story'
      : `${story} (${worktree === undefined ? branch : `${branch}, ${worktree}`})`;
  return forYou.includes(path)
    ? `${where} changes ${path} too, and merging its branch into this one now leaves that file to settle by hand.`
    : `${where} changes ${path} too.`;
}

// What `stories --json` says, read again once its copy in the guard's folder is a minute old,
// with the path of the project inside its repository: the files are named from its top.
export function storiesOf(project) {
  if (!project.cli) {
    return undefined;
  }
  const cache = join(project.root, GUARD_STATE, 'stories.json');
  const cached = readJson(cache);
  if (cached && Date.now() - cached.at < STORIES_TTL) {
    return cached;
  }
  const view = runCli(project, ['stories', '--json'], 3000);
  const prefix = gitRun(project, ['rev-parse', '--show-prefix']);
  if (!view || prefix.status !== 0) {
    return undefined;
  }
  const fresh = { at: Date.now(), prefix: prefix.stdout.trim(), view };
  writeState(cache, fresh);
  return fresh;
}

function storyBuildReason(project) {
  const story = storyOf(project);
  if (story === undefined) {
    return undefined;
  }
  const fix = fixOf(project);
  if (fix !== undefined) {
    return fixBuildReason(fix);
  }
  if (!project.cli) {
    return undefined;
  }
  const cache = join(project.root, GUARD_STATE, 'story-gate.json');
  const key = storyInputsKey(project);
  if (readJson(cache)?.key === key) {
    return undefined;
  }
  const gate = runCli(project, ['story', story, '--gate', 'build', '--json'], 4000);
  if (gate === undefined || gate.met === true) {
    if (gate?.met === true) {
      writeState(cache, { key });
    }
    return undefined;
  }
  return `The code of story ${story} waits for its build gate: a design review section per row and the acceptance written and locked, before any code. Next: ${quoted(gate.next)} (\`npx ddd-ts-kit story ${story}\` shows every phase).`;
}

// The build gate of a fix is its proof: the regression spec written, listed and locked; no row, no review.
function fixBuildReason({ story, locked }) {
  return locked
    ? undefined
    : `The code of fix ${story} waits for its regression spec, locked: write the spec that reproduces the defect, see it fail on an assertion, list it under \`## Regression\` of docs/architecture/stories/${story}.md next to its \`## Statement\`, then \`npx ddd-ts-kit acceptance ${story} --lock\` (skill ddd-ts-kit:fix).`;
}

// The size and the time of change of every file the build gate of a story reads.
function storyInputsKey(project) {
  const hash = createHash('sha256');
  const entries = STORY_INPUTS.flatMap((input) => filesBelow(join(project.root, input))).map((file) => ({
    file,
    stat: statSync(file, { throwIfNoEntry: false }),
  }));
  // A file that vanished between the listing and the stat is left out.
  for (const { file, stat } of entries.filter((entry) => entry.stat !== undefined)) {
    hash.update(`${file}\0${stat.size}\0${stat.mtimeMs}\n`);
  }
  return hash.digest('hex');
}

function filesBelow(path) {
  if (!isDirectory(path)) {
    return existsSync(path) ? [path] : [];
  }
  return readdirSync(path)
    .sort()
    .flatMap((name) => filesBelow(join(path, name)));
}
