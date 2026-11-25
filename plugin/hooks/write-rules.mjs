// The rules on a written file, whatever tool writes it: generated and governed files, the baseline, the
// scope files, what a role file must come from, the dependency rules before the write, the scripts of
// the manifest. Read by pre-write and pre-bash.
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isRecord, parseJson, readText } from './disk.mjs';
import { gitRun } from './git.mjs';
import { editsOf, hostOf, isSubAgent, isTestWriter } from './hook-input.mjs';
import {
  CONFIG,
  describe,
  E2E_SPEC,
  errorsOf,
  findProject,
  insideContexts,
  outsideItsModule,
  projectPath,
  runCli,
  SPEC_FILE,
  TEST_DIRECTORY,
} from './project.mjs';
import { STORY_SCOPE, WORKER_SCOPE } from './repository.mjs';
import { holdsFile } from './story-rules.mjs';
import { REPORT_TO_CONDUCTOR } from './worker-scope.mjs';

// The contracts in YAML or JSON (openapi/<document>, the form of a route in openapi/forms/, the
// AsyncAPI document), the event catalog and the split of the contract that `ddd-ts-kit docs`
// writes in the platform. The settings of the project only ask before an edit of them: a deny
// rule there would make them read-only to `docs:generate` too, under the sandbox of Claude Code.
export const GENERATED_DOCUMENT =
  /^(?:openapi\/(?:forms\/)?[^/]+|docs\/integration\/asyncapi)\.(?:ya?ml|json)$|^docs\/integration\/event-catalog\.md$|(?:^|\/)http\/openapi-documents\.ts$/;

const GENERATORS = [
  [/\.aggregate\.ts$/, 'aggregate <context> <Name>'],
  [/\.entity\.ts$/, 'entity <context> <Name>'],
  [/\.vo\.ts$/, 'value-object <context> <Name>'],
  [/\.vocabulary\.ts$/, 'vocabulary <context> <Name> --value <value>...'],
  [/\.event\.ts$/, 'domain-event <context> <Aggregate> <Fact>'],
  [
    /\.error\.ts$/,
    'error <context> <Refusal> <factory> (under "stack.refusals": "factories": error <context> <Concept> <refusal>)',
  ],
  // At the level of the context, or in a module of its model (<module>/domain/services/).
  [/\/domain\/(?:[^/]+\/)?services\/[^/]+\.service\.ts$/, 'domain-service <context> <Name>'],
  [/\/domain\/(?:[^/]+\/)?repositories\/[^/]+\.repository\.ts$/, 'repository <context> <Aggregate>'],
  [/\.command\.ts$/, 'command <context> <UseCase> (--permission <aggregate>.<action> [--grant <role>] | --public)'],
  // But in the presentation layer of a context, where `*.query.ts` is the schema of a query string,
  // written by hand (`isQuerySchema`).
  [/\.query\.ts$/, 'query <context> <UseCase> (--permission <aggregate>.<action> [--grant <role>] | --public)'],
  [
    /\.handler\.ts$/,
    'command|query <context> <UseCase> (--permission <aggregate>.<action> [--grant <role>] | --public)',
  ],
  [/\.port\.ts$/, 'port <context> <Name>'],
  [/\.policy\.ts$/, 'policy <context> <Name> --permission <aggregate>.<action>'],
  [/\.event-handler\.ts$/, 'event-handler <context> <Aggregate> <Fact>'],
  [
    /\.job\.ts$/,
    'job <context> <Name> (--every <duration> | --cron "<expression>" [--time-zone <zone>]) --command <UseCase>',
  ],
  [/\.publisher\.ts$/, 'integration-event <context> <Aggregate> <Fact>'],
  [/\.integration-event\.ts$/, 'integration-event <context> <Aggregate> <Fact>'],
  [/\.integration-handler\.ts$/, 'integration-handler <context> <upstream> <event-type>'],
  [/\.gateway\.ts$/, 'gateway <context> <upstream> <Name>'],
  [/\.adapter\.ts$/, 'adapter <context> <Port> [--kind external|gateway] [--decorators]'],
  [/\/infrastructure\/anti-corruption\/[^/]+\.translator\.ts$/, 'acl <context> <upstreamOrSystemName>'],
  [/\.route\.ts$/, 'route <context> <UseCase> --method <M> --path <p>'],
  [/\.builder\.ts$/, 'builder <context> <Aggregate>'],
  [/\.e2e\.spec\.ts$/, 'e2e <context> <UseCase>'],
  [/\.acceptance\.spec\.ts$/, 'acceptance <story>'],
];

// A policy file decides on one element. The requires(...) of the use cases are not policies: the
// generator of a command or a query writes them, in the module file of the module it is given.
const POLICY_FILE = /\.policy\.ts$/;
const DECLARATIONS_HOME =
  ' A policy decides on one element. The requires(...) declarations of the use cases are not a policy: `generate command|query ... --module <module>` writes them in <module>/<module>.module.ts, never in a file of application/authorization/. When the module file of the context is too long to take one, the module does not exist yet: report it to the conductor, who creates it with `generate module <context> <module>`.';

// A journey crosses use cases, and often contexts: no single route generates it, so it is written by hand.
const JOURNEY = /^test\/e2e\/journey-[^/]+\.e2e\.spec\.ts$/;

// Changing these is a decision about the rules themselves: the project owner confirms it.
const GOVERNED_FILES = [
  /^ddd-ts-kit\.config\.json$/,
  /^eslint\.config\.[cm]?js$/,
  /^biome\.jsonc?$/,
  /^knip\.json$/,
  /^lefthook\.yml$/,
  /^commitlint\.config\.[cm]?js$/,
  /^tsconfig(\.[a-z]+)?\.json$/,
  /^(vitest|jest)(\.e2e)?\.config\.[cm]?[jt]s$/,
  /^\.gitlab-ci\.yml$/,
  /^\.gitlab\//,
  /^\.github\/(workflows|actions|scripts)\//,
  /^\.github\/dependabot\.ya?ml$/,
  /^renovate\.json$/,
  /^stryker\.config\.[cm]?js$/,
  /^pnpm-workspace\.yaml$/,
  /^\.claude\/hooks\//,
  /^REVIEW\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/rules\//,
  /^\.github\/instructions\//,
  /^\.github\/copilot\/settings\.json$/,
  /^\.github\/hooks\//,
  /^\.codex\//,
];

// The errors a codebase had when it adopted the kit: written by the project owner, lowered by `check --baseline prune`.
const BASELINE_FILE = /^ddd-ts-kit-baseline\.json$/;

export const BASELINE_OWNER =
  'it is written by the project owner, in a terminal, when the project adopts the kit; an agent never writes it, since one command would silence every error of the moment, its own included. `npx ddd-ts-kit check --baseline prune` lowers it after a fix and follows a `git mv`, without asking. Fix the error instead.';

// The rules of dependency between layers and contexts: what a new import breaks, judged on its own lines.
const DEPENDENCY_RULES = [
  'layer/domain-purity',
  'layer/application-inward',
  'layer/infrastructure-no-presentation',
  'layer/presentation-no-infrastructure',
  'context/published-language-only',
];

const ESCAPES = [
  [/ddd-ts-kit-disable/g, 'an architecture rule suppression'],
  [/eslint-disable/g, 'a lint suppression'],
  [/@ts-(ignore|nocheck|expect-error)/g, 'a compiler diagnostic suppression'],
  [/\b(it|test|describe)\.(skip|only)\b/g, 'a skipped or focused test'],
  [/\bas any\b/g, 'an `any` assertion'],
];

// The roles of the shared kernel a generator writes, at its root: `generate <kind> shared-kernel ...`.
const SHARED_KERNEL_GENERATORS = [
  [/\.vo\.ts$/, 'value-object shared-kernel <Name>'],
  [
    /\.error\.ts$/,
    'error shared-kernel <Refusal> <factory> (under "stack.refusals": "classes": domain-error shared-kernel <Name>)',
  ],
];

// How the record of a trial is appended: created if missing, never through a link under its name.
const RECORD_APPEND = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW;

export function generatedFileReason(project, file) {
  const path = projectPath(project, file);
  if (GENERATED_DOCUMENT.test(path)) {
    return `${path} is generated. Change the route or event declaration, or "openapi" in ${CONFIG}, then run \`npm run docs:generate\`.`;
  }
  if (path === '.dependency-cruiser.cjs') {
    return `${path} is generated from ${CONFIG}. Change the config, then run \`npx ddd-ts-kit depcruise-config --write\`.`;
  }
  return isBarrel(project, path)
    ? `${path} holds generated declarations of its context. Never edit it: \`npx ddd-ts-kit generate ...\` and \`npx ddd-ts-kit docs\` rewrite it from the role files.`
    : undefined;
}

/**
 * The summary at the root of a context, the declarations of a layer, named after it
 * (application/application.declarations.ts), or those of a role folder an earlier version wrote,
 * named after the folder (application/commands/commands.declarations.ts): in the context, or in a
 * module of its model that the config declares.
 */
export function isBarrel(project, path) {
  const [context, ...parts] = insideContexts(project, path) ?? [];
  if (parts.length === 1) {
    return parts[0] === `${context}.declarations.ts`;
  }
  const [layer, ...below] = outsideItsModule(project, context, parts);
  const folder = below.length === 2 ? below[0] : layer;
  return (
    ['application', 'infrastructure', 'presentation'].includes(layer) &&
    below.length <= 2 &&
    below.at(-1) === `${folder}.declarations.ts`
  );
}

// A spec, the tests at the root of the project, or the test folders of a context: another folder
// named `test` holds no test of the kit.
export function testWriterScopeReason(project, file, input) {
  if (!isTestWriter(input)) {
    return undefined;
  }
  const path = projectPath(project, file);
  const isTest =
    SPEC_FILE.test(path) || path.startsWith('test/') || (insideContexts(project, path) && TEST_DIRECTORY.test(path));
  return isTest
    ? undefined
    : `The test writer changes tests only. ${path} is production code: report the defect instead of editing it.`;
}

export function handWrittenRoleReason(project, file) {
  const path = projectPath(project, file);
  if (path.startsWith(`${project.sharedKernelDir}/`)) {
    return handWrittenSharedReason(path, existsSync(file));
  }
  if (
    existsSync(file) ||
    JOURNEY.test(path) ||
    isPartOfSpec(project, path) ||
    !(insideContexts(project, path) || path.startsWith('test/e2e/') || path.startsWith('test/acceptance/'))
  ) {
    return undefined;
  }
  if (/\.ports\.ts$/.test(path)) {
    return `${path} would be a file of tokens. A port is an abstract class and its own injection token, one per \`*.port.ts\`: \`npx ddd-ts-kit generate port <context> <Name> --json\`.`;
  }
  if (E2E_SPEC.test(path)) {
    return `${path} is a new end-to-end spec. The spec of a use case is generated: \`npx ddd-ts-kit generate e2e <context> <UseCase> --json\`. Two are written by hand: a part of a spec split by behaviour, named after the spec it comes from (test/e2e/<use-case>-<behaviour>.e2e.spec.ts beside test/e2e/<use-case>.e2e.spec.ts), and a journey across use cases (test/e2e/journey-<name>.e2e.spec.ts).`;
  }
  const generator = isQuerySchema(project, path) ? undefined : GENERATORS.find(([suffix]) => suffix.test(path));
  return generator
    ? `${path} is a new file of a generated role. Create it with \`npx ddd-ts-kit generate ${generator[1]} --json\`, then fill the TODO(domain) markers.${POLICY_FILE.test(path) ? DECLARATIONS_HOME : ''}`
    : undefined;
}

// The schema of a query string, `*.query.ts` in the presentation layer of a context: of the context
// itself (`<context>/presentation/`), of one of its modules or of what its modules share
// (`<context>/<module>/presentation/`, `<context>/shared/presentation/`). A folder named
// `presentation` anywhere else, or a context of that name, is no such layer.
function isQuerySchema(project, path) {
  const [, layer, inner] = path.slice(project.contextsDir.length + 1).split('/');
  const layers = ['domain', 'application', 'infrastructure'];
  return (
    path.startsWith(`${project.contextsDir}/`) &&
    /\.query\.ts$/.test(path) &&
    (layer === 'presentation' || (inner === 'presentation' && !layers.includes(layer)))
  );
}

// A value object of the shared kernel and its refusals are generated as those of a context are.
function handWrittenSharedReason(path, exists) {
  const generator = exists ? undefined : SHARED_KERNEL_GENERATORS.find(([suffix]) => suffix.test(path));
  return generator
    ? `${path} is a new file of a generated role of the shared kernel. Create it with \`npx ddd-ts-kit generate ${generator[1]} --term "<Term>=<meaning>" --json\`, which also writes its term in the glossary of the shared kernel, then fill the TODO(domain) markers.`
    : undefined;
}

// A long end-to-end spec is split by behaviour: each part is named after the spec it comes from,
// `<use-case>-<behaviour>.e2e.spec.ts` beside `<use-case>.e2e.spec.ts`, which no generator can write.
function isPartOfSpec(project, path) {
  const words = E2E_SPEC.exec(path)?.[1].split('-') ?? [];
  return words
    .slice(1)
    .some((_, index) =>
      existsSync(join(project.root, 'test/e2e', `${words.slice(0, index + 1).join('-')}.e2e.spec.ts`)),
    );
}

// The scope file of a story or of a worker, and the kit's folder that holds it, are the conductor's:
// the session of the worktree that holds it, and every sub-agent, change them in no way, nor
// remove them with a folder above them (`below`: every file under the place, or 'untracked': those
// git does not ignore).
export function scopeFileReason(project, { place, below }, input) {
  const path = projectPath(project, place);
  const held = [STORY_SCOPE, WORKER_SCOPE].find(
    (scope) =>
      existsSync(join(project.root, scope)) &&
      (path === scope || path === dirname(scope) || (holdsFile(path, scope) && reachesScope(project, scope, below))),
  );
  const own = isSubAgent(input) || findProject(input.cwd ?? process.cwd())?.root === project.root;
  return held && own
    ? `${held} is a shared file of this worktree, its scope: the conductor writes it with \`story-scope\` or \`worker-scope\`, and it holds the gates of the work done here. ${REPORT_TO_CONDUCTOR}`
    : undefined;
}

// `git check-ignore` answers 1 for a file it does not ignore; out of a repository, git cleans nothing.
function reachesScope(project, scope, below) {
  return below === 'untracked' ? gitRun(project, ['check-ignore', '--quiet', scope]).status === 1 : below;
}

export function baselineFileReason(project, file) {
  return BASELINE_FILE.test(projectPath(project, file)) ? `ddd-ts-kit-baseline.json: ${BASELINE_OWNER}` : undefined;
}

// With dependenciesBeforeWrite, the lines a write adds to a TypeScript file, those it did not hold
// before, are judged by the dependency rules before they reach the disk: a new import that breaks
// one is refused with the message of the checker. An import the file already held is left to the
// check after the write. A slow or failing check lets the write through.
export function dependencyReason(project, { file, written, replaced }, input) {
  const added =
    project.dependenciesBeforeWrite && project.cli && /\.(ts|mts|cts)$/.test(file) && newLines(file, written, replaced);
  if (!added || !/\bimport\b|\brequire\(/.test(added)) {
    return undefined;
  }
  // A directory of its own, readable by this user only: never a predictable name in the shared temp dir.
  const directory = mkdtempSync(join(tmpdir(), 'ddd-ts-kit-before-write-'));
  const text = join(directory, 'written.ts');
  writeFileSync(text, added, { mode: 0o600 });
  try {
    const rules = DEPENDENCY_RULES.flatMap((rule) => ['--rule', rule]);
    const started = Date.now();
    const report = runCli(project, ['check-file', file, '--content-from', text, ...rules, '--json'], 4000);
    const ms = Date.now() - started;
    if (!Array.isArray(report?.violations)) {
      // A CLI older than --content-from, a timeout, a crash: not judged, and recorded as such.
      recordTrial(project, { file, ms, host: hostOf(input), unjudged: report?.error?.message ?? 'no report' });
      return undefined;
    }
    const errors = errorsOf(report);
    recordTrial(project, { file, refused: [...new Set(errors.map((error) => error.ruleId))], ms, host: hostOf(input) });
    return errors.length > 0
      ? `this write adds ${errors.length} import(s) a dependency rule refuses, so it was not written (dependenciesBeforeWrite, on trial). Write it without them.\n${describe(errors)}`
      : undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// The trial is decided on what it did: each judged write is a line of the record of the repository,
// in its git directory, which every worktree shares and none commits. A record that cannot be written
// is skipped.
function recordTrial(project, { file, ...outcome }) {
  try {
    const common = gitRun(project, ['rev-parse', '--git-common-dir']);
    if (common.status !== 0) {
      return;
    }
    const directory = join(resolve(project.root, common.stdout.trim()), 'ddd-ts-kit');
    mkdirSync(directory, { recursive: true });
    const entry = { at: new Date().toISOString(), file: projectPath(project, file), ...outcome };
    // Appended through no link: a link put under the name of the record is never followed.
    const descriptor = openSync(join(directory, 'before-write.jsonl'), RECORD_APPEND, 0o600);
    try {
      writeSync(descriptor, `${JSON.stringify(entry)}\n`);
    } finally {
      closeSync(descriptor);
    }
  } catch {
    // The record serves the verdict of the trial, never the write.
  }
}

// The lines of the written text the file did not hold: an Edit is compared with the text it replaces,
// a Write with the file on disk.
function newLines(file, written, replaced) {
  const held = replaced.trim() !== '' ? replaced : existsSync(file) ? readFileSync(file, 'utf8') : '';
  const before = held.split('\n');
  const left = new Map();
  for (const line of before) {
    left.set(line, (left.get(line) ?? 0) + 1);
  }
  return written
    .split('\n')
    .filter((line) => {
      const held = left.get(line) ?? 0;
      left.set(line, held - 1);
      return held <= 0;
    })
    .join('\n');
}

export function governedFileReason(project, file) {
  const path = projectPath(project, file);
  return GOVERNED_FILES.some((pattern) => pattern.test(path))
    ? `${path} holds the rules or the pipeline. Changing it is a decision of the project owner: confirm it, and record the reason in docs/adr/ when it relaxes a rule.`
    : undefined;
}

// package.json is edited for its dependencies all day; its scripts are what the gates run. A change of
// the `scripts` block is asked, read from the text the call leaves in the file; a text that is not
// JSON, or a patch of Codex, whose result the guard does not rebuild, is asked too.
export function scriptsChangeReason(project, file, input) {
  if (projectPath(project, file) !== 'package.json') {
    return undefined;
  }
  const before = readText(file, '');
  const after = textAfterWrite(editsOf(input).find((edit) => edit.file === file) ?? {}, before);
  const changed = after === undefined ? undefined : changedScripts(scriptsOf(before) ?? {}, scriptsOf(after));
  if (changed?.length === 0) {
    return undefined;
  }
  const what = changed
    ? `changes the script${changed.length > 1 ? 's' : ''} ${changed.map((name) => `\`${name}\``).join(', ')}`
    : 'leaves a package.json the guard cannot read the scripts of';
  return `This edit ${what}: the scripts of package.json are what the gates and the pipeline run. Changing one is a decision of the project owner: confirm it, and record the reason in docs/adr/ when it relaxes a rule.`;
}

// The text of the file once the tool ran: Write and the creates of Copilot and VS Code give it whole;
// an edit is applied to the current text, each one in turn. Undefined when the call gives neither: a
// patch, or the `code` of VS Code, a sketch of the change that the host merges into the file.
function textAfterWrite(tool, before) {
  const whole = tool.content ?? tool.file_text;
  if (typeof whole === 'string') {
    return whole;
  }
  const edits = (Array.isArray(tool.edits) ? tool.edits : [tool]).map(replacementOf);
  if (!edits.every(({ from, to }) => typeof from === 'string' && typeof to === 'string')) {
    return undefined;
  }
  return edits.reduce(
    (text, { from, to, everywhere }) =>
      everywhere === true ? text.split(from).join(to) : text.replace(from, () => to),
    before,
  );
}

// The text an edit replaces and the text it leaves, in the fields of each host.
function replacementOf(edit) {
  return {
    from: edit.old_string ?? edit.old_str ?? edit.oldString,
    to: edit.new_string ?? edit.new_str ?? edit.newString,
    everywhere: edit.replace_all,
  };
}

// The `scripts` of a manifest, `{}` when it has none, undefined when the text is not a JSON object.
function scriptsOf(text) {
  const manifest = parseJson(text);
  if (!isRecord(manifest)) {
    return undefined;
  }
  return isRecord(manifest.scripts) ? manifest.scripts : {};
}

// The names of the scripts added, removed or changed; undefined when the new text cannot be read.
function changedScripts(before, after) {
  if (after === undefined) {
    return undefined;
  }
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return names.filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
}

export function escapeReason(written, replaced) {
  const added = ESCAPES.find(([pattern]) => count(written, pattern) > count(replaced, pattern));
  return added
    ? `This change adds ${added[1]}. Fix the cause instead; if the deviation is deliberate, the project owner confirms it and it carries a reason pointing to a decision record in docs/adr/.`
    : undefined;
}

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}
