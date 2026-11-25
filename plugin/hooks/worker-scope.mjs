// The scope of a context worker: the scope file of its worktree, the pin that records it at its first
// call, and why a path is outside it. Read by session, pre-write, pre-bash and subagent-stop.
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isRecord, readJson, realOf, realPlace } from './disk.mjs';
import { git } from './git.mjs';
import { sharedStateFile, stateFile, writeState } from './guard-state.mjs';
import { isWorkerAgent, toolInput, writesOf } from './hook-input.mjs';
import { removeKitFile } from './kit-files.mjs';
import { E2E_SPEC, findProject, insideContexts, projectPath } from './project.mjs';
import { commonDirOf, hasWorkerWorktree, repositoryTop, WORKER_SCOPE, workerWorktrees } from './repository.mjs';
import { COMMIT_ID, CONTEXT_NAME, GIT_REF, named } from './said-as-data.mjs';

// The report a worker keeps current after each commit and before it ends, ignored by git: what the conductor reads when it stops.
const WORKER_REPORT = '.ddd-ts-kit/report.md';

// A decision record of a worker's own slices: a new file of docs/adr/. With --deviation it also writes the config.
export const DECISION_RECORD = /^docs\/adr\/[^/]+\.md$/;
// The migration a worker generates in its worktree, `npm run db:generate working-<what>`, as each
// migration tool writes it; the conductor generates the real one on the trunk at merge.
const WORKING_MIGRATION = /(^|\/)migrations\/(.+\/)?\d+[_-]working[_-][\w-]*(\.(sql|[cm]?[jt]s)|\/migration\.sql)$/;
// The models of one context on Prisma, `prisma/schema/<context>.prisma`: its worker changes a column
// with the mapper; `prisma/schema/schema.prisma` (the client, the datasource, the platform) is shared.
const PRISMA_CONTEXT_SCHEMA = /^prisma\/schema\/([a-z][a-z0-9-]*)\.prisma$/;

export const REPORT_TO_CONDUCTOR = 'Do not work around it: finish what you can and report the need to the conductor.';
const UNREAD_PIN =
  'The record of your scope, which the guard keeps since your first call, cannot be read, and the guard pins no worker twice: every call is held. Change nothing: end with your report, and tell the conductor to launch this worker again.';

// The scope of a worker in each worktree, read once per call of the guard (`workerScope`).
const scopes = new Map();

export function releasePin(pin) {
  const pinned = readJson(pin);
  if (isPin(pinned) && named(readJson(join(pinned.worktree, WORKER_SCOPE))?.context, CONTEXT_NAME) === pinned.context) {
    removeKitFile(pin);
  }
}

export function workerScopeReason(project, file, input) {
  const scope = workerScope(project, input);
  return scope && (scope.changed ?? contextScopeReason(project, projectPath(project, file), scope.context));
}

// Why `path` of the project is outside the scope of a worker of `context`, if it is.
export function contextScopeReason(project, path, context) {
  if (
    // The folder of the context itself is the scope too, for a tool given it whole.
    `${path}/`.startsWith(`${project.contextsDir}/${context}/`) ||
    E2E_SPEC.test(path) ||
    `${path}/`.startsWith(`test/e2e/support/${context}/`) ||
    path === WORKER_REPORT ||
    prismaSchemaContext(path) === context ||
    isWorkingMigration(project, path) ||
    isOwnDecisionRecord(project, path)
  ) {
    return undefined;
  }
  const owner =
    insideContexts(project, path) || prismaSchemaContext(path)
      ? 'belongs to another bounded context, which has its own worker'
      : 'is a shared file (config, composition root, platform, generated documents, migrations, dependencies) that only the conductor or a generator changes';

  return `You build the context "${context}": writes are limited to ${project.contextsDir}/${context}/, its models on Prisma (prisma/schema/${context}.prisma), its end-to-end specs and their support in test/e2e/support/${context}/. ${path} ${owner}. ${REPORT_TO_CONDUCTOR}`;
}

// The context whose models a file of the Prisma schema holds; the main file holds none.
function prismaSchemaContext(path) {
  const context = PRISMA_CONTEXT_SCHEMA.exec(path)?.[1];
  return context === 'schema' ? undefined : context;
}

// A record the worker generated and has not committed yet; the records of the trunk are not its to rewrite.
function isOwnDecisionRecord(project, path) {
  return DECISION_RECORD.test(path) && git(project, ['ls-files', '--', path]) === '';
}

function isWorkingMigration(project, path) {
  return !insideContexts(project, path) && !path.startsWith(`${project.platformDir}/`) && WORKING_MIGRATION.test(path);
}

// The context of a worker in this checkout; a pinned worker that strayed elsewhere has none here.
export function workerContext(project, input) {
  const scope = workerScope(project, input);
  return scope?.away ? undefined : scope?.context;
}

// The scope of a worker is pinned at its first call: its context and its worktree are recorded
// where its working directory cannot move the record (`sharedStateFile`), which a worker does not
// write, keyed by session and agent, and every later call is judged against that record, read once
// per call of the guard: the pin follows the worker. A scope file that disappeared or names
// another context, or the scope file of another worktree, makes `changed` the refusal of every call of the worker there. A checkout
// without a scope file (the conductor's, or the worktree of a story) leaves the worker `away`: it
// is the refusal of what it writes there, and its reads stay free.
export function workerScope(project, input) {
  if (!isWorkerAgent(input)) {
    return undefined;
  }
  if (!scopes.has(project.root)) {
    scopes.set(project.root, pinnedScope(project, input));
  }
  return scopes.get(project.root);
}

// The worktree is recorded and compared by its real path: a link to it, or another spelling of it, is the same.
// A worker whose session stands in a scoped worktree is pinned to it, even when its first command
// starts in another project, as long as no other checkout of the repository holds a scope: where
// several workers have a worktree, the one a session happens to stand in may be a sibling's, and
// only a call that names its worktree pins it. Until then the worker has no scope: it reads, and
// what it writes is refused with the shape that names a worktree (`builderStrayRefusal`).
function pinnedScope(project, input) {
  const current = namedContext(project);
  const read = readPin(project, input);
  if (read.unread) {
    return { context: current ?? 'unread', changed: UNREAD_PIN };
  }
  const pinned = read.pinned ?? firstPin(project, input, read.file);
  if (!pinned) {
    return undefined;
  }
  if (pinned.worktree !== realpathSync(project.root)) {
    return current
      ? { context: current, changed: otherWorktreeReason(pinned, project) }
      : { context: pinned.context, changed: awayReason(pinned, project), away: true };
  }
  if (current !== pinned.context) {
    return { context: pinned.context, changed: scopeChangedReason(pinned, current) };
  }
  // What the scope file recorded at the pin is what holds: the conductor wrote it, and the code a
  // worker runs could rewrite the file.
  return JSON.stringify(recordedScope(project)) !== JSON.stringify(pinned.scope)
    ? { context: current, changed: scopeRewrittenReason(pinned) }
    : { context: current, ...pinned.scope };
}

// The pin of a first call, written in `file`: of the checkout the call judges when it holds a scope,
// else of the one the session stands in; none where the call names no checkout and another one
// holds a scope too.
function firstPin(project, input, file) {
  const home = findProject(input.cwd ?? process.cwd()) ?? project;
  const own = namedContext(project) ? project : namedContext(home) && home;
  if (!own || (!namesCheckout(input, own) && hasAnotherScope(own.root))) {
    return undefined;
  }
  const pinned = {
    context: namedContext(own),
    worktree: realpathSync(own.root),
    mode: own.mode,
    scope: recordedScope(own),
  };
  writeState(file, pinned);
  return pinned;
}

// Whether a checkout of the repository other than `root` holds the scope of a worker: one of its
// linked worktrees, or its main checkout, the folder that holds the common directory. Outside a
// repository there is no other checkout.
function hasAnotherScope(root) {
  const common = commonDirOf(root);
  if (!common) {
    return false;
  }
  const main = mainCheckout(root, common);
  const scoped = [...workerWorktrees(root), ...(existsSync(join(main, WORKER_SCOPE)) ? [main] : [])];
  return scoped.some((checkout) => realOf(checkout) !== realOf(root));
}

// The project in the main checkout of the repository, the folder that holds its common directory.
function mainCheckout(root, common) {
  return join(dirname(common), relative(repositoryTop(root), root));
}

// What the scope file of a worktree records beside its context: the base its branch was cut from
// and merges, the commit that base named, and its branch, each null when absent or not of its grammar.
function recordedScope(project) {
  const file = readJson(join(project.root, WORKER_SCOPE));
  return {
    base: named(file?.base, GIT_REF) ?? null,
    baseCommit: named(file?.baseCommit, COMMIT_ID) ?? null,
    branch: named(file?.branch, GIT_REF) ?? null,
  };
}

// The pin of a worker, read where it is kept. A pin an earlier version of the guard took, in that
// place or in the guard's folder of a checkout (the one the call starts in, the one it names, the
// main one), recorded no scope: it is kept, with the scope the worktree it names records now, never
// replaced by a pin of the place this call happens to stand in. A pin that stands in any of these
// places and is none (cut short, rewritten, closed to reading) is `unread`: the worker is held, not
// pinned again.
export function readPin(project, input) {
  const file = pinFile(project, input);
  const pinned = readJson(file);
  if (isPin(pinned)) {
    return { file, pinned };
  }
  const places = earlierPinFiles(project, input);
  const earlier = [file, ...places].map(readJson).find(isEarlierPin);
  if (earlier) {
    const kept = { ...earlier, scope: recordedScope({ root: earlier.worktree }) };
    writeState(file, kept);
    places.filter((place) => place !== file).forEach(removeKitFile);
    return { file, pinned: kept };
  }
  return { file, unread: [file, ...places].some((place) => lstatSync(place, { throwIfNoEntry: false }) !== undefined) };
}

function earlierPinFiles(project, input) {
  const home = findProject(input.cwd ?? process.cwd()) ?? project;
  const common = commonDirOf(project.root);
  const roots = [home.root, project.root, ...(common ? [mainCheckout(project.root, common)] : [])];
  return [...new Set(roots)].map((root) => stateFile('scope', { root }, input));
}

function isEarlierPin(value) {
  return isRecord(value) && typeof value.worktree === 'string' && named(value.context, CONTEXT_NAME) !== undefined;
}

function pinFile(project, input) {
  return sharedStateFile('scope', findProject(input.cwd ?? process.cwd()) ?? project, input);
}

// Whether the call names the checkout `own` by an absolute path, whatever the working directory of
// its session: the directory its command moves to (`cd <worktree> && ...`, `--cwd`), the file an
// editor tool is given. A path read from another working directory names the same place only then.
function namesCheckout(input, own) {
  const { command } = toolInput(input);
  const placesFrom = (cwd) => [
    ...(typeof command === 'string' ? [commandDirectory(command, cwd)] : []),
    ...writesOf({ ...input, cwd }).map(({ file }) => dirname(file)),
  ];
  const anywhere = new Set(placesFrom(sep));
  return placesFrom(input.cwd ?? process.cwd()).some(
    (place) => anywhere.has(place) && findProject(place)?.root === own.root,
  );
}

// A worker's guard keeps the mode of its first call in its worktree: a config there that turns the
// guard off, or grows past what the guard reads, does not lift it, and its change is compared as any
// other change outside the scope.
export function withPinnedMode(project, input) {
  if (project?.mode !== 'off' || !isWorkerAgent(input)) {
    return project;
  }
  const { pinned } = readPin(project, input);
  if (pinned && inRepositoryOf(pinned.worktree, project.root) && ['advise', 'enforce'].includes(pinned.mode)) {
    project.mode = pinned.mode;
  }
  return project;
}

// The worktree itself, or another checkout of its repository: a config that turns the guard off in
// the checkout of the session lifts a pinned worker no more than one in its own worktree.
function inRepositoryOf(worktree, root) {
  const common = commonDirOf(worktree);
  return worktree === realOf(root) || (common !== undefined && common === commonDirOf(root));
}

// The context the scope file of the worktree names, or the environment of the guard.
export function namedContext(project) {
  return named(
    process.env.DDD_TS_KIT_WORKER_CONTEXT ?? readJson(join(project.root, WORKER_SCOPE))?.context,
    CONTEXT_NAME,
  );
}

function scopeRewrittenReason(pinned) {
  return `The scope file changed: ${WORKER_SCOPE} of your worktree still names the context "${pinned.context}", but its base, its base commit or its branch is not what it was at your first call. Change nothing until it is back: report to the conductor, who restores it.`;
}

function isPin(value) {
  return isEarlierPin(value) && isRecord(value.scope);
}

function scopeChangedReason(pinned, current) {
  const now = current ? `names the context "${current}"` : 'is gone or names no context';
  return `The scope file changed: ${WORKER_SCOPE} of your worktree named the context "${pinned.context}" at your first call and now ${now}. Change nothing until it is back: report to the conductor, who restores it.`;
}

function otherWorktreeReason(pinned, project) {
  return `Your scope is the context "${pinned.context}" in the worktree ${pinned.worktree}, pinned at your first call: ${project.root} is the worktree of another worker. Run your commands as \`cd ${pinned.worktree} && ...\` and write your files by their absolute path under it; if this worktree is the one of your briefing, report to the conductor.`;
}

function awayReason(pinned, project) {
  return `Your scope is the context "${pinned.context}" in the worktree ${pinned.worktree}, pinned at your first call: ${project.root} is not your worktree. Write the file by its absolute path under your worktree. ${REPORT_TO_CONDUCTOR}`;
}

// A builder that has no pin yet, writing in a checkout without a scope of a repository of worker
// worktrees: a path that forgot its worktree lands in the checkout of the conductor.
export function strayWriteReason(project, input) {
  return isWorkerAgent(input) && !workerScope(project, input) && hasWorkerWorktree(project.root)
    ? `${namedContext(project) ? 'This call names no worktree, and several workers have one in this repository' : `${project.root} holds no scope of a worker, and worker worktrees stand in this repository`}. Write the file by its absolute path under the worktree of your briefing, and run a command as \`cd <worktree> && ...\`. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

// A sub-agent keeps the working directory of its session: its worktree shows in the command.
export function commandDirectory(command, cwd) {
  const named =
    /--cwd[= ]\s*("[^"]+"|'[^']+'|\S+)/.exec(command) ??
    /^\s*(?:cd|pushd)\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*&&/.exec(command);
  const directory = named?.[1]?.replace(/^["']|["']$/g, '');
  if (!directory) {
    return cwd;
  }

  return isAbsolute(directory) ? directory : resolve(cwd, directory);
}

// A file of a worker's scope is the file it reaches: through a link, or a folder of its path that is
// one, it is judged where it lands; a file that has another name (a hard link) may be written there too.
export function linkReason(project, place, input) {
  const scope = workerScope(project, input);
  if (!scope) {
    return undefined;
  }
  const path = projectPath(project, place);
  const real = relative(realpathSync(project.root), realPlace(place)).split(sep).join('/');
  if (real !== path) {
    const away = real.startsWith('../');
    return away || contextScopeReason(project, real, scope.context)
      ? `${path} is a link to ${away ? realPlace(place) : real}, outside your scope: a worker writes through no link that leaves it. ${REPORT_TO_CONDUCTOR}`
      : undefined;
  }
  // Only a regular file has another name: a folder counts itself and each folder it holds.
  const stat = statSync(place, { throwIfNoEntry: false });
  return stat?.isFile() && stat.nlink > 1
    ? `${path} has another name elsewhere (a hard link): writing it changes that file too. A worker writes only files of its scope that have one name. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}
