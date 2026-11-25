import path from 'node:path';
import { CliError } from '../../cli-error';
import type { Arguments } from '../../commands/arguments';
import { defineCommand } from '../../commands/command';
import { STANDALONE_RULE_IDS } from '../catalogue/standalone-rule-ids';
import type { CheckResult } from '../engine/check-result';
import { runCheck } from '../engine/run-check';
import { loadLooseProject } from '../project/load-loose-project';
import { toPosix } from '../project/to-posix';
import { CHECK_FORMATS } from './check-formats';
import { knownRules } from './known-rules';
import { printCheck } from './print-check';
import { refuseMissingPaths } from './refuse-missing-paths';

/**
 * `check --clean-only <dir>...`: the rules that judge a file on its own, on the directories given
 * as they are. No project, no config, hence no history to compare with and no baseline.
 */
export const cleanOnlyCommand = defineCommand({
  name: 'check',
  mode: {
    chosenBy: 'clean-only',
    because: 'it judges the directories given as they are, outside a project, its history and its baseline',
  },
  positionals: '<dir>...',
  options: {
    'clean-only': { type: 'boolean' },
    rule: { type: 'string', value: '<id>', multiple: true },
    format: { type: 'string', values: CHECK_FORMATS },
    explain: { type: 'boolean' },
  },
  run(args, io) {
    const format = args.format('text');
    const result = checkCleanliness(args, knownRules(args.many('rule')));

    return printCheck(io, result, { format, explain: args.flag('explain') });
  },
});

/** The rules that judge a file on its own, on any directories: no project, no config. */
function checkCleanliness(args: Arguments, rules: readonly string[]): CheckResult {
  const directories = args.positionals.length > 0 ? args.positionals : ['.'];

  refuseWhatNeedsAProject(rules);
  refuseMissingPaths(args);

  const selected = rules.length > 0 ? rules : STANDALONE_RULE_IDS;

  const project = loadLooseProject(
    args.workingDirectory,
    directories.map((entry) => toPosix(path.normalize(entry))),
  );

  return runCheck(project, { rules: selected });
}

/** Directories read as they are hold no project for a rule that asks about one. */
function refuseWhatNeedsAProject(rules: readonly string[]): void {
  const needing = rules.filter((id) => !STANDALONE_RULE_IDS.includes(id));

  if (needing.length > 0) {
    throw new CliError(
      `--clean-only does not run ${needing.join(', ')}.`,
      `It holds the rules that judge a file on its own: ${STANDALONE_RULE_IDS.join(', ')}.`,
    );
  }
}
