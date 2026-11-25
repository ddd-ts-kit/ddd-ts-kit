import { CliError } from '../../cli-error';
import { defineCommand } from '../../commands/command';
import type { Io } from '../../commands/io';
import { baselineFollowingMoves } from '../baseline/baseline-following-moves';
import { prunedBaseline } from '../baseline/pruned-baseline';
import { BASELINE_FILE, readBaseline } from '../baseline/read-baseline';
import { recordedBaseline } from '../baseline/recorded-baseline';
import { renamedFiles } from '../baseline/renamed-files';
import { writeBaseline } from '../baseline/write-baseline';
import { runCheck } from '../engine/run-check';
import { loadProject } from '../project/load-project';

/**
 * `--baseline write` records the errors of every rule on every file; `--baseline prune` lowers the
 * recorded counts to what the project still has, and never raises one.
 */
export const baselineCommand = defineCommand({
  name: 'check',
  options: { baseline: { type: 'string' } },
  run(args, io) {
    const mode = args.text('baseline');

    if (mode !== 'write' && mode !== 'prune') {
      throw new CliError(`Unknown --baseline "${mode ?? ''}".`, 'Use --baseline write or --baseline prune.');
    }

    if (args.positionals.length > 0) {
      throw new CliError(`--baseline ${mode} judges every rule on every file.`, 'Run it without a path.');
    }

    return rewriteBaseline(args.projectRoot, mode, io);
  },
});

function rewriteBaseline(root: string, mode: 'write' | 'prune', io: Io): number {
  const { violations } = runCheck(loadProject(root));
  const recorded = readBaseline(root);

  const baseline =
    mode === 'write' || recorded === undefined
      ? recordedBaseline(violations)
      : prunedBaseline(baselineFollowingMoves(recorded, renamedFiles(root)), violations);

  writeBaseline(root, baseline);
  io.out(baselineSummary(baseline));

  return 0;
}

function baselineSummary(baseline: ReturnType<typeof recordedBaseline>): string {
  const entries = Object.values(baseline).flatMap((rules) => Object.values(rules));
  const errors = entries.reduce((total, { count }) => total + count, 0);

  return `${BASELINE_FILE}: ${errors} error${errors === 1 ? '' : 's'} recorded in ${Object.keys(baseline).length} file${Object.keys(baseline).length === 1 ? '' : 's'}. Commit it; \`ddd-ts-kit check\` reports only what it does not hold, and fails when a count it records is no longer reached.`;
}
