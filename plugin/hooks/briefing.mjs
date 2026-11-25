// What a session start says of a project: the order of work, a merge half done, the version gap, the
// plan, the story, the workers to resume, the map of the contexts. Read by session.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { call } from './call.mjs';
import { readJson, readText } from './disk.mjs';
import { unreadRepositoryNotice } from './git.mjs';
import { CLEAN_INSTALL, CONFIG, CONFIG_BYTES, GUARD_MODES, runCli } from './project.mjs';
import { commitReminder } from './reminders.mjs';
import { gitDirOf, hasWorkerWorktree, WORKER_SCOPE } from './repository.mjs';
import { ABSOLUTE_PATH, AGENT_ID, CONTEXT_NAME, GIT_REF, LABEL, named, quoted, STORY_ID } from './said-as-data.mjs';
import { fixOf, storiesOf, storyOf, worktreeNotice } from './story-rules.mjs';
import { workerContext } from './worker-scope.mjs';

// The version of the packages the skills of this plugin describe. `release-version.mjs` keeps it
// the version of the kit: setting a new version of the packages rewrites it.
const KIT_VERSION = '0.114.1';
const PLAN = 'docs/architecture/plan.md';

// A fetch older than this leaves the trunk of a story behind the remote one: the session is told to fetch.
const STALE_FETCH = 3_600_000;

// The host caps SessionStart context at 10 000 characters; a session should start far below it.
const SESSION_CONTEXT_LIMIT = 3000;

// Said at session start under the regulated profile, in place of what the CLI would have answered.
const REGULATED_NOTICE =
  'Regulated profile: the guard runs no program of this project, neither its CLI nor its Biome, at any hook: the pipeline and the commit gate hold those checks, and `npx ddd-ts-kit check` runs them here.';

const BRIEFING_CUT =
  'Briefing cut short: the CLI did not answer in time; `npx ddd-ts-kit status` and `npx ddd-ts-kit list` say the rest.';

export function projectBriefing(project, input) {
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

export function planPointer(root) {
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
