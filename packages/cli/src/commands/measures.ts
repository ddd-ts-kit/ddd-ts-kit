import { CliError } from '../cli-error';
import { formatMeasures } from '../measures/format-measures';
import { readMeasures } from '../measures/read-measures';
import { defineCommand } from './command';
import { stdoutJson } from '../json/stdout-json';

/**
 * The measures of the stories of the project, from the git history of the current branch and
 * the files of `docs/architecture/`: design, build and lead time, the rework of the requirements,
 * the provisional decisions, the compromises, the review, the verification, the parallelism, the
 * origin and the repeat incidents, per story and as medians over the period. Reads, never writes,
 * and asks nothing of the platform.
 */
export const measuresCommand = defineCommand({
  name: 'measures',
  options: {
    since: { type: 'string', value: '<date>' },
    story: { type: 'string', value: '<code>' },
    'by-author': { type: 'boolean' },
    format: { type: 'string', values: ['text', 'json'] },
  },
  run(args, io) {
    const format = args.format('text');

    const view = readMeasures(args.projectRoot, {
      ...sinceOf(args.text('since')),
      ...args.texts(['story']),
      byAuthor: args.flag('by-author'),
    });

    io.out(format === 'json' ? stdoutJson(view) : formatMeasures(view));

    return 0;
  },
});

function sinceOf(since: string | undefined): { since?: string } {
  if (since === undefined) {
    return {};
  }

  if (Number.isNaN(Date.parse(since))) {
    throw new CliError(`--since ${since} is not a date.`, 'Write it as ISO 8601: --since 2026-01-01.');
  }

  return { since };
}
