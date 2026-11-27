import { CliError } from '../cli-error';
import { abortMerge } from '../merge/abort-merge';
import { formatMergeReport } from '../merge/format-merge-report';
import { mergeTrunk } from '../merge/merge-trunk';
import type { MergeReport } from '../merge/merge-report';
import { resumeMerge } from '../merge/resume-merge';
import type { Arguments } from './arguments';
import { defineCommand } from './command';
import { stdoutJson } from '../json/stdout-json';

/** The options that start a merge, refused with `--continue` or `--abort`. */
const STARTING = ['trunk', 'since', 'to-land', 'dry-run'] as const;

/**
 * Brings the trunk into the branch as one merge commit computed from the branch's own diff, or
 * goes on with (`--continue`) or undoes (`--abort`) the merge it left in progress. Exits 0 once
 * committed, up to date or previewed, 1 when something is left to a person (the merge stays in
 * progress), 2 when it cannot start.
 */
export const mergeTrunkCommand = defineCommand({
  name: 'merge-trunk',
  usage: [
    'ddd-ts-kit merge-trunk [--trunk <git-ref>] [--since <commit>] [--to-land] [--dry-run]',
    'ddd-ts-kit merge-trunk --continue [--accept-lost] | --abort',
  ],
  options: {
    trunk: { type: 'string' },
    since: { type: 'string' },
    'to-land': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    continue: { type: 'boolean' },
    'accept-lost': { type: 'boolean' },
    abort: { type: 'boolean' },
  },
  run(args, io) {
    refuseMixed(args);

    if (args.flag('abort')) {
      const said = abortMerge(args.projectRoot);

      io.out(args.json ? stdoutJson({ status: 'aborted', message: said }) : said);

      return 0;
    }

    const report = args.flag('continue')
      ? resumeMerge(args.projectRoot, { acceptLost: args.flag('accept-lost'), now: new Date() })
      : mergeTrunk({
          root: args.projectRoot,
          toLand: args.flag('to-land'),
          dryRun: args.flag('dry-run'),
          ...args.texts(['trunk', 'since']),
        });

    io.out(args.json ? stdoutJson(report) : formatMergeReport(report));

    return exitCodeOf(report);
  },
});

function refuseMixed(
  args: Arguments<'trunk' | 'since', 'to-land' | 'dry-run' | 'continue' | 'abort' | 'accept-lost'>,
): void {
  const starting = STARTING.filter((option) =>
    option === 'trunk' || option === 'since' ? args.text(option) !== undefined : args.flag(option),
  );

  const going = args.flag('continue') || args.flag('abort');

  if (args.flag('continue') && args.flag('abort')) {
    throw new CliError('--continue and --abort exclude each other.', 'Go on with the merge, or undo it: not both.');
  }

  if (going && starting.length > 0) {
    throw new CliError(
      `--${starting[0] ?? ''} starts a merge; --continue and --abort act on the one in progress.`,
      'Run `npx ddd-ts-kit merge-trunk --continue` (or `--abort`) alone; its trunk and base are recorded.',
    );
  }

  if (args.flag('accept-lost') && !args.flag('continue')) {
    throw new CliError(
      '--accept-lost records, in the merge commit, the losses of a merge that stopped on them.',
      'Run `npx ddd-ts-kit merge-trunk --continue --accept-lost` after the stop.',
    );
  }
}

function exitCodeOf(report: MergeReport): number {
  return report.status === 'stopped' ? 1 : 0;
}
