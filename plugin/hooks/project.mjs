// The project a path belongs to: its config read once, its guard mode and its regulated profile, the
// CLI it installed and a run of it, its paths as the rules name them. Every mode reads it.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { call } from './call.mjs';
import { isOwnFolder, isRecord, parseJson, readBounded, readJson } from './disk.mjs';
import { repositoryTop } from './repository.mjs';

export const CONFIG = 'ddd-ts-kit.config.json';
// The settings of Claude Code that turn its sandbox on, in a project.
const CLAUDE_SETTINGS = '.claude/settings.json';
// The most of the config the guard reads: a larger one is not read, and the guard judges nothing there.
export const CONFIG_BYTES = 256 * 1024;

// What the config may say of the guard; anything else is read as enforce.
export const GUARD_MODES = ['off', 'advise', 'enforce'];

const COMMIT_DEFAULTS = { maxFiles: 20, maxLines: 600 };

// The files Biome formats: with `formatOnWrite` in the config, the project's own Biome lays one out as it is written.
export const FORMATTED_FILE = /\.(?:[cm]?[jt]sx?|jsonc?)$/;

// The tests of the guard shrink its time limits with DDD_TS_KIT_GUARD_TIME_SCALE (a fiftieth) to reach
// them with a CLI that sleeps; a user has no reason to set it.
export const TIME_SCALE = timeScale(process.env.DDD_TS_KIT_GUARD_TIME_SCALE);

// A test or a spec, inside a context: the proof of a fix is written there before its code.
export const TEST_DIRECTORY = /(^|\/)test\//;
export const SPEC_FILE = /\.spec\.ts$/;

// An end-to-end spec at the top of test/e2e/: the one of a use case, a part of it, or a journey.
export const E2E_SPEC = /^test\/e2e\/([^/]+)\.e2e\.spec\.ts$/;

// The clean install of each package manager: what installs the lockfile as it is.
export const CLEAN_INSTALL = { npm: 'npm ci', pnpm: 'pnpm install --frozen-lockfile' };

// The most the guard reads of the answer of a process it starts: past it the process is stopped.
export const ANSWER_BYTES = 64 * 1024 * 1024;

// The projects this run of the guard has described: a hook finds the same one several times.
const projects = new Map();
// The profile of each folder read.
const profiles = new Map();

// Up to a folder another user may write: a config there, the shared temp dir above all, is no project.
export function findProject(from) {
  let directory = resolve(from);
  for (;;) {
    if (!isOwnFolder(directory)) {
      return undefined;
    }
    if (existsSync(join(directory, CONFIG))) {
      return describeProject(directory);
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function describeProject(root) {
  if (!projects.has(root)) {
    projects.set(root, readProject(root));
  }
  return projects.get(root);
}

// What the guard reads of a project, its config read once: a field of the wrong type is its default.
function readProject(root) {
  const { config, tooLarge } = readConfig(join(root, CONFIG));
  const text = (key, otherwise) =>
    Object.hasOwn(config, key) && typeof config[key] === 'string' && config[key] !== '' ? config[key] : otherwise;
  const installed = installedCli(root);
  const regulated = isRegulated(root);
  return {
    root,
    // Under the regulated profile no program of the project runs: of its CLI, the version its manifest states.
    cli: regulated ? undefined : installed,
    cliVersion: installed?.version,
    regulated,
    sourceRoot: text('sourceRoot', 'src'),
    contextsDir: text('contextsDir', 'src/contexts'),
    sharedKernelDir: text('sharedKernelDir', `${text('sourceRoot', 'src')}/shared-kernel`),
    // The modules of the model each context declares: one folder of the context holding its layers.
    modules: modulesByContext(config.contexts),
    platformDir: text('platformDir', 'src/platform'),
    commit: commitLimits(config.commit),
    packageManager: config.stack?.packageManager === 'pnpm' ? 'pnpm' : 'npm',
    // enforce: block; advise: ask the user; off: silent; any other value, enforce, said at session start.
    // A config too large to read leaves the guard off there, said at session start too.
    ...(tooLarge === undefined
      ? guardMode(process.env.DDD_TS_KIT_GUARD ?? config.guard ?? 'enforce')
      : { mode: 'off', tooLarge }),
    // required (what init writes in a new project): the code of a context is refused in the main checkout
    // of the trunk; advised (the key absent, a project started before): only said.
    worktrees: config.worktrees === 'required' ? 'required' : 'advised',
    // The project's Biome runs on each written file before the check; absent, off.
    formatOnWrite: config.formatOnWrite === true && !regulated,
    // On trial: the dependency rules judge the text about to be written, before the write; absent, after it.
    dependenciesBeforeWrite: config.dependenciesBeforeWrite === true,
  };
}

// Hooks run outside the sandbox and a sandboxed command may write the project, node_modules and the config
// included, so the regulated profile is read where such a command cannot lift it: at the root and in every
// folder above it, so that a config planted lower says nothing, and in the settings that turn the sandbox on,
// which the sandbox of Claude Code denies to its commands in their working directory and above. A folder
// another user writes says nothing either way.
export function isRegulated(root) {
  if (!profiles.has(root)) {
    profiles.set(root, foldersUp(root).filter(isOwnFolder).some(statesRegulatedProfile));
  }
  return profiles.get(root);
}

function foldersUp(directory) {
  const above = dirname(directory);
  return above === directory ? [directory] : [directory, ...foldersUp(above)];
}

// The config of the folder names the profile, or its settings hold what the profile writes for this: the
// sandbox on, with no command let out of it. A sandbox a command can leave is no boundary to keep.
function statesRegulatedProfile(folder) {
  const sandbox = readJson(join(folder, CLAUDE_SETTINGS))?.sandbox;
  return (
    readConfig(join(folder, CONFIG)).config.agents?.profile === 'regulated' ||
    (sandbox?.enabled === true && sandbox.allowUnsandboxedCommands === false)
  );
}

// The config as an object of JSON, never read above CONFIG_BYTES; one that cannot be read or parsed
// is the defaults.
function readConfig(path) {
  const { content, tooLarge } = readBounded(path, CONFIG_BYTES);
  if (tooLarge !== undefined) {
    return { config: {}, tooLarge };
  }
  const config = parseJson(content ?? '');
  return { config: isRecord(config) ? config : {} };
}

// What a refusal is in the mode of the project: a question put to the user under advise, a denial otherwise.
export function decisionOf(project) {
  return project.mode === 'advise' ? 'ask' : 'deny';
}

function guardMode(asked) {
  return GUARD_MODES.includes(asked) ? { mode: asked } : { mode: 'enforce', unknownMode: asked };
}

// The CLI the project installed, where Node would find it: in the project, or hoisted to a parent
// by the workspaces of npm or pnpm (a project of a monorepo, the example of this repository), never
// above the top of its repository, where a folder another user writes (the temp dir) could hold one.
function installedCli(root) {
  const top = repositoryTop(root) ?? root;
  let directory = root;
  for (;;) {
    const cli = installedBin(join(directory, 'node_modules', 'ddd-ts-kit'), 'ddd-ts-kit', 'ddd-ts-kit');
    if (cli || directory === top) {
      return cli;
    }
    directory = dirname(directory);
  }
}

// The bin `command` of the package `name` installed in `home`, and its version: the file its manifest
// names, inside the package once links are followed. The guard runs it with Node, never through
// node_modules/.bin, whose entry may be any file a repository commits (and is a shell shim on pnpm).
export function installedBin(home, name, command) {
  const manifest = readJson(join(home, 'package.json'));
  if (manifest?.name !== name) {
    return undefined;
  }
  try {
    const bin = realpathSync(resolve(home, manifest.bin[command]));
    return bin.startsWith(`${realpathSync(home)}${sep}`) ? { bin, version: manifest.version } : undefined;
  } catch {
    // No bin of that name, or a file that is not there.
    return undefined;
  }
}

function commitLimits(configured) {
  const limit = (key) =>
    Number.isInteger(configured?.[key]) && configured[key] > 0 ? configured[key] : COMMIT_DEFAULTS[key];
  return { maxFiles: limit('maxFiles'), maxLines: limit('maxLines') };
}

/**
 * The path of a file inside its context, its module of the model left out, as the CLI reads it:
 * a module holds its layers and its tests (<module>/application/..., <module>/test/...), and what the
 * modules of a context share sits in one folder (shared/infrastructure/..., shared/presentation/...,
 * shared/test/...), read as the same path without it.
 */
export function outsideItsModule(project, context, parts) {
  const modules = project.modules[context] ?? [];
  const [first, second, ...rest] = parts;
  if (modules.includes(first) && ['domain', 'application', 'infrastructure', 'presentation', 'test'].includes(second)) {
    return [second, ...rest];
  }
  const shared =
    modules.length > 0 && first === 'shared' && ['infrastructure', 'presentation', 'test'].includes(second);
  return shared ? [second, ...rest] : parts;
}

// By context name, in a map without prototype: a context named `constructor` or `__proto__` is a name.
function modulesByContext(contexts) {
  const modules = Object.create(null);
  for (const [name, context] of Object.entries(isRecord(contexts) ? contexts : {})) {
    modules[name] = isRecord(context?.modules) ? Object.keys(context.modules) : [];
  }
  return modules;
}

export function insideContexts(project, path) {
  return path.startsWith(`${project.contextsDir}/`) ? path.slice(project.contextsDir.length + 1).split('/') : undefined;
}

export function describePlace(project, place) {
  if (place === undefined) {
    return 'files only the shell knows';
  }
  const path = projectPath(project, place);
  if (path === '{}' || path.endsWith('/{}')) {
    return path === '{}' ? 'files anywhere in the project' : `files under ${path.slice(0, -3)}`;
  }

  return path === '' ? 'the whole project' : path.startsWith('..') ? place : path;
}

export function projectPath(project, file) {
  return relative(project.root, resolve(file)).split(sep).join('/');
}

// A run of the CLI, stopped at its time limit, and within what is left of a session start: past
// that, it is not started.
export function runCli(project, args, timeout) {
  const left = call.briefingEnds === undefined ? Number.POSITIVE_INFINITY : call.briefingEnds - Date.now();
  const limit = Math.min(Math.round(timeout * TIME_SCALE), left);
  if (limit <= 0) {
    call.briefingCut = true;
    return undefined;
  }
  const run = spawnSync(process.execPath, [project.cli.bin, ...args], {
    cwd: project.root,
    encoding: 'utf8',
    timeout: limit,
    maxBuffer: ANSWER_BYTES,
  });
  if (run.error?.code === 'ETIMEDOUT') {
    call.timedOut.set(args[0], Math.round(limit / 1000));
    call.briefingCut = call.briefingEnds !== undefined;
  }
  if (run.error?.code === 'ENOBUFS') {
    call.oversized.add(args[0]);
  }
  // A report is an object of JSON: no output (a run that could not start, whose null parses as null),
  // `null` or a bare value is none.
  try {
    const report = JSON.parse(run.stdout);
    return isRecord(report) ? report : undefined;
  } catch {
    return undefined;
  }
}

function timeScale(asked) {
  const scale = Number(asked);
  return scale > 0 && scale <= 1 ? scale : 1;
}

export function errorsOf(report) {
  return (report?.violations ?? []).filter((violation) => violation.severity === 'error');
}

export function describe(violations) {
  return violations
    .map(
      (violation) =>
        `[${violation.ruleId}] ${violation.file}:${violation.line ?? 1} ${violation.message}\n  do instead: ${violation.fix ?? `see \`npx ddd-ts-kit explain ${violation.ruleId}\``}`,
    )
    .join('\n');
}
