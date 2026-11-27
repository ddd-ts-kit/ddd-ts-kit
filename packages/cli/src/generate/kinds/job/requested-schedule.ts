import { CliError } from '../../../cli-error';
import type { Reading } from '../../scope';
import type { JobSchedule } from '../../schedule/job-schedule';
import { jobScheduleProblem } from '../../schedule/job-schedule-problem';

const SAMPLE = '--every 15m, or --cron "0 7 * * 1-5" --time-zone Europe/Paris';

/** The schedule `--every`, or `--cron` and `--time-zone`, ask for: exactly one of the two, and one the scheduler can read. */
export function requestedSchedule(flags: Reading<'every' | 'cron' | 'time-zone'>): JobSchedule {
  const every = flags.text('every');
  const cron = flags.text('cron');
  const timeZone = flags.text('time-zone');

  if ((every === undefined) === (cron === undefined)) {
    throw new CliError(
      every === undefined ? 'A job needs a schedule.' : '--every and --cron exclude each other.',
      `Pass exactly one of the two: ${SAMPLE}.`,
    );
  }

  if (cron === undefined && timeZone !== undefined) {
    throw new CliError(
      '--time-zone needs --cron.',
      'An interval is aligned on the Unix epoch and reads no clock: drop --time-zone, or give the schedule as a cron expression.',
    );
  }

  const schedule =
    every === undefined
      ? { ...(cron === undefined ? {} : { cron }), ...(timeZone === undefined ? {} : { timeZone }) }
      : { every };

  const problem = jobScheduleProblem(schedule);

  if (problem !== undefined) {
    throw new CliError(problem, `Pass a schedule the scheduler can read: ${SAMPLE}.`);
  }

  return schedule;
}
