import path from 'node:path';
import { CliError } from '../../cli-error';
import type { Arguments } from '../../commands/arguments';
import { defineCommand } from '../../commands/command';
import { findRoot } from '../../commands/find-root';
import { knownCommit } from '../../commit/known-commit';
import { applyBaseline } from '../baseline/apply-baseline';
import { readBaseline } from '../baseline/read-baseline';
import type { CheckResult } from '../engine/check-result';
import { runCheck } from '../engine/run-check';
import { summarize } from '../engine/summarize';
import type { Project } from '../model/project';
import type { Violation } from '../model/violation';
import { loadProject } from '../project/load-project';
import { toPosix } from '../project/to-posix';
import { changedSince } from './changed-since';
import { CHECK_FORMATS } from './check-formats';
import { isReportedSince } from './is-reported-since';
import { knownRules } from './known-rules';
import { printCheck } from './print-check';
import { refuseMissingPaths } from './refuse-missing-paths';

const CHANGED_SINCE_FIX =
  'Run it in a git repository and name a branch, a tag or a commit git knows (`git fetch origin` first in CI, with enough history): `--changed-since origin/main`.';

/** `check [paths...]`: the architecture rules on the project, or on the paths given, the errors its baseline records left quiet. */
export const checkCommand = defineCommand({
  name: 'check',
  // Written by hand: it names `--self`, which chooses another command of `check`.
  usage: [
    'ddd-ts-kit check [paths...] [--rule <id>]... [--format text|json|github|gitlab] [--changed-since <git-ref>] [--explain] [--self]',
  ],
  options: {
    rule: { type: 'string', multiple: true },
    format: { type: 'string', values: CHECK_FORMATS },
    'changed-since': { type: 'string' },
    explain: { type: 'boolean' },
  },
  run(args, io) {
    const format = args.format('text');
    const result = checkProject(args, knownRules(args.many('rule')));

    return printCheck(io, result, { format, explain: args.flag('explain') });
  },
});

function checkProject(args: Arguments<'changed-since'>, rules: readonly string[]): CheckResult {
  const cwd = args.workingDirectory;
  const root = findRoot(cwd);

  refuseMissingPaths(args);

  const project = loadProject(root);
  const result = withBaseline(root, runCheck(project, { rules }), rules);

  const scopes = args.positionals.map((entry) =>
    toPosix(path.relative(root, path.resolve(cwd, entry))).replace(/\/$/, ''),
  );

  refuseScopeWithoutSources(project, args.positionals, scopes);

  const ref = args.text('changed-since');
  const changed = ref === undefined ? undefined : changedSince(root, knownCommit(root, ref, CHANGED_SINCE_FIX));

  const reported = result.violations.filter(
    (violation) => isInScope(violation, scopes) && isReportedSince(violation, changed),
  );

  return summarize(reported, result);
}

/**
 * A path that exists but holds no source the checker reads would report "0 errors" like a clean one.
 * Only a path asked for is judged: `check` alone on a project with no context yet reads its sources
 * and reports them, which is not the same as being asked about a place that has none.
 */
function refuseScopeWithoutSources(project: Project, asked: readonly string[], scopes: readonly string[]): void {
  const empty = asked.filter(
    (_, index) =>
      !project.files.some(
        (file) => scopes[index] === '' || file.path === scopes[index] || file.path.startsWith(`${scopes[index]}/`),
      ),
  );

  if (empty.length > 0) {
    throw new CliError(
      `${empty.join(', ')} holds nothing to check.`,
      `The checker reads the TypeScript files (*.ts) under ${project.config.sourceRoot}/: name one of them or a folder that holds some, or leave the path out to check the whole project.`,
    );
  }
}

/** The errors the baseline of the project records stay quiet; a count it no longer reaches is judged when every rule ran. */
function withBaseline(root: string, result: CheckResult, rules: readonly string[]): CheckResult {
  const baseline = readBaseline(root);

  return baseline === undefined
    ? result
    : summarize(applyBaseline(result.violations, baseline, { stale: rules.length === 0 }), result);
}

/** In scope: a finding on a file given, or one repaired in a file given (the list a store is missing from). */
function isInScope({ file, subjects = [] }: Violation, scopes: readonly string[]): boolean {
  const isGiven = (candidate: string): boolean =>
    scopes.some((scope) => scope === '' || candidate === scope || candidate.startsWith(`${scope}/`));

  return scopes.length === 0 || [file, ...subjects].some(isGiven);
}
