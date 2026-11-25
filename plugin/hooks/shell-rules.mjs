// The rules on a shell command, in the order they are asked: what waits for a place, a landing, a lock
// or a generator first; what a worker may not run; what the shell writes of any other session meet.
// Read by pre-bash.
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { call } from './call.mjs';
import { isDirectory, readJson } from './disk.mjs';
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
import { noteBeforeCode, pendingChangeReason } from './held-changes.mjs';
import { isReadOnlyAgent, isSubAgent, isTestWriter, isWorkerAgent } from './hook-input.mjs';
import { CONFIG, describePlace, findProject, projectPath } from './project.mjs';
import { hasWorkerWorktree } from './repository.mjs';
import {
  DEPENDENCY_CHANGES,
  gitInvocation,
  INSTALLS,
  isPureReader,
  kitInvocations,
  readsAnywhere,
  readsFromAnywhere,
  VALUED_MANAGER_OPTIONS,
} from './shell-reads.mjs';
import {
  changedPaths,
  FREE_OUTPUT,
  isFreePlace,
  multiplyNamed,
  PATH_COMMANDS,
  RSYNC_VALUED,
  targetDirectory,
  writtenTargets,
} from './shell-writes.mjs';
import {
  acceptanceFilesShellReason,
  acceptanceLockingReason,
  generates,
  generatorPlaceReason,
  lockedRegressionReason,
  storyCodeReason,
  worktreeCodeReason,
} from './story-rules.mjs';
import { linkReason, REPORT_TO_CONDUCTOR, workerScope, workerScopeReason } from './worker-scope.mjs';
import {
  baselineFileReason,
  generatedFileReason,
  handWrittenRoleReason,
  scopeFileReason,
  testWriterScopeReason,
} from './write-rules.mjs';

const FOLDER_FILES = 5000;

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

const EDIT_WITH_TOOLS = `Inside your scope, the editor tools and the shell may both write; outside it, nothing may. ${FREE_OUTPUT}`;

// What takes a file away or gives it back its content from git: no one wrote the text it leaves,
// and a generated file is rebuilt after it.
const PUTS_BACK = new Set(['rm', 'unlink', 'git checkout', 'git restore', 'git rm', 'git clean']);

// The commands that, given a folder that exists, write the files they are given under it.
const LANDING_COMMANDS = new Set(['cp', 'mv', 'ln', 'install', 'rsync']);
// The options by which `cp` links instead of copying, or copies a whole tree.
const CP_BRINGS = /^(?:-[a-zA-Z]*[alrRs][a-zA-Z]*|--(?:link|symbolic-link|recursive|archive))$/;
const CP_TREE = /^(?:-[a-zA-Z]*[arR][a-zA-Z]*|--(?:recursive|archive))$/;

// The variables that move where the shell finds a path, a directory or a program, or git its repository.
const PLACE_VARIABLES = /^(?:TMPDIR|XDG_RUNTIME_DIR|CDPATH|HOME|GIT_DIR|GIT_WORK_TREE|PATH)=/;

// What the shell writes of a session that is not a context worker meet, in the project each place
// belongs to: the story build gate and the generated or baseline files for everyone, the test-writer
// held to the paths of a test. What a redirection, `sed -i` or `tee` types in a file is held as the
// editor tools are; what a command only moves, deletes or restores is not.
export function sessionShellReason(input, commands) {
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
  if (!isReadOnlyAgent(input)) {
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

// A context-builder keeps the working directory of its session, so the scope of a worker is found
// only when the command moves into its worktree (`cd <worktree> && ...` or `--cwd`). When the
// session has worker worktrees and a builder's command touches no scoped project, a write by that
// command lands where the guard cannot judge it: it is refused, with the one shape it reads.
export function builderStrayReason(project, input, commands) {
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
export function isHeldToAWorktree(project, input) {
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
export async function preparingReason(project, input, { command, commands }) {
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
export function workerCommandReason(project, input, { context, command, commands }) {
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

// Taking one side of a merge erases what the other side added without a conflict: a sub-agent
// resolves each hunk instead. A derived file outside the sources (openapi/, the context map) is
// taken from either side and regenerated, so only the sources and the tests are held.
function oneSideMergeReason(project, input, commands) {
  if (!isSubAgent(input)) {
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
