// What the guard says and never refuses: the size of what is uncommitted, a row that departed from its
// design. Read by session and stop.
import { join } from 'node:path';
import { readBounded } from './disk.mjs';
import { git, gitRun } from './git.mjs';
import { alreadyRemembered, forget, reminderMarker, saidOnce } from './guard-state.mjs';
import { insideContexts, outsideItsModule, runCli } from './project.mjs';
import { WORKER_SCOPE } from './repository.mjs';
import { fixOf, storyOf } from './story-rules.mjs';
import { GENERATED_DOCUMENT, isBarrel } from './write-rules.mjs';

const COUNTED_FILE_BYTES = 1_000_000;

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
// Rewritten by a command: counted in no commit size, merged by regenerating.
const DERIVED_FILES = [...LOCKFILES, '.dependency-cruiser.cjs', 'docs/context-map.md'];

// In the worktree of a story, a done row whose design review cites a name the code does not have,
// with no compromise listed in the report: said once per session for the same names, never blocking.
export function designReminder(project, input) {
  const story = storyOf(project);
  if (story === undefined || !project.cli || fixOf(project) !== undefined) {
    return undefined;
  }
  const design = runCli(project, ['story-check', story, '--json'], 20000)?.design ?? [];
  if (design.length === 0) {
    return undefined;
  }
  const names = design.map(({ document, line, cited }) => `${document}:${line}:${cited}`).join('\n');
  if (saidOnce(project, input, 'design', names)) {
    return undefined;
  }
  const named = design
    .slice(0, 5)
    .map(({ cited, row, document, line }) => `\`${cited}\` (#${row}, ${document}:${line})`)
    .join(', ');
  return `ddd-ts-kit: a row departed from its design: update its review section or list the compromise. ${design.length} name(s) of the design of story ${story} are not in the code: ${named}. \`npx ddd-ts-kit story-check ${story}\` lists them, and \`### Compromises\` of \`## Report\` in docs/architecture/stories/${story}.md records what was built otherwise.`;
}

export function hasPendingChanges(project) {
  const status = gitRun(project, ['status', '--porcelain']);
  return status.status !== 0 || status.stdout.trim().length > 0;
}

// Said once per session while the tree stays above the limits; a session start says it again.
export function commitReminder(project, input, { repeat }) {
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
