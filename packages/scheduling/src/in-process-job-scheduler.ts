import {
  DuplicateJobError,
  InvalidJobScheduleError,
  NoopLogger,
  NoopMetrics,
  UnknownJobError,
  type Clock,
  type ExecutionScope,
  type IdGenerator,
  type JobDefinition,
  type JobDescription,
  type JobRun,
  type JobScheduler,
  type Lock,
  type Logger,
  type Metrics,
  type TenantDirectory,
} from '@ddd-ts-kit/kernel';
import type { JobCheckpoints } from './job-checkpoints';
import { JobRecorder } from './job-recorder';
import type { JobRunObserver } from './job-run-observer';
import { JobRunner } from './job-runner';
import type { JobTimers } from './job-timers';
import type { Occurrence } from './occurrence';
import { RegisteredJob } from './registered-job';
import { systemJobTimers } from './system-job-timers';

export interface InProcessJobSchedulerOptions {
  /** Every instant comes from it: the system clock is never read. */
  readonly clock: Clock;
  /** Taken for each occurrence of a `singleInstance` job. Between processes only with an adapter that is. */
  readonly lock: Lock;
  /** Each run happens inside it, in a context of origin `schedule`. */
  readonly scope: ExecutionScope;
  /** Gives each run its correlation id. */
  readonly ids: IdGenerator;
  /** Default: writes nothing. */
  readonly logger?: Logger;
  /** Default: measures nothing. */
  readonly metrics?: Metrics;
  /** Default: the timers of the runtime. */
  readonly timers?: JobTimers;
  /** Default: none, and a restart forgets what passed while the process was down. */
  readonly checkpoints?: JobCheckpoints;
  /** Draws the jitter, in [0, 1). Default `Math.random`. */
  readonly random?: () => number;
  /** An occurrence reached later than this, jitter aside, is missed. Default 60 000. */
  readonly lateAfterMs?: number;
  /** How long `stop()` waits for the runs in progress before aborting them. Default 30 000. */
  readonly graceMs?: number;
  /** How long the lock of an occurrence is kept for a job without `timeoutMs`. Default 900 000. */
  readonly lockTtlMs?: number;
  readonly onRun?: JobRunObserver;
  /** The tenants a job declared `tenancy: 'per-tenant'` runs for, one run each. Required to register one. */
  readonly tenants?: TenantDirectory;
}

type Settings = Required<
  Omit<InProcessJobSchedulerOptions, 'checkpoints' | 'onRun' | 'lock' | 'scope' | 'ids' | 'tenants'>
> &
  Pick<InProcessJobSchedulerOptions, 'checkpoints'>;

/*
 * A sleep never lasts longer: the wall clock and the timers of the runtime drift apart, and a
 * timer of the runtime cannot wait more than 24 days. A timer that fires early finds nothing
 * due and sleeps again.
 */
const LONGEST_SLEEP_MS = 3_600_000;

/** A start or a stop runs whole before the next begins, so that the scheduler is in one of these at a time. */
type Phase = 'stopped' | 'started' | 'stopping';

/**
 * The scheduler inside one process. Instants come from the `Clock`, sleeps go through the
 * timers, and nothing is remembered across a restart unless `checkpoints` is given. Several
 * instances of an application each run one: the `Lock` decides which of them runs an occurrence.
 */
export class InProcessJobScheduler implements JobScheduler {
  private readonly jobs = new Map<string, RegisteredJob>();

  private readonly ticks = new Set<Promise<void>>();

  private readonly settings: Settings;

  private readonly recorder: JobRecorder;

  private readonly runner: JobRunner;

  private phase: Phase = 'stopped';

  /** The start or the stop in progress, which the next one waits for. */
  private lifecycle: Promise<void> = Promise.resolve();

  constructor(options: InProcessJobSchedulerOptions) {
    const { clock, logger = new NoopLogger(), metrics = new NoopMetrics(), timers = systemJobTimers } = options;

    const {
      lateAfterMs = 60_000,
      graceMs = 30_000,
      lockTtlMs = 900_000,
      random = Math.random,
      checkpoints,
      onRun,
    } = options;

    const { lock, scope, ids } = options;

    this.settings = {
      clock,
      logger,
      metrics,
      timers,
      lateAfterMs,
      graceMs,
      lockTtlMs,
      random,
      ...(checkpoints === undefined ? {} : { checkpoints }),
    };

    this.recorder = new JobRecorder({ clock, logger, metrics, ...(onRun === undefined ? {} : { onRun }) });
    const runner = { clock, lock, scope, ids, timers, lockTtlMs, lateAfterMs };

    this.runner = new JobRunner({ ...runner, ...tenantsOf(options) }, this.recorder);
  }

  register(definition: JobDefinition): void {
    if (this.jobs.has(definition.name)) {
      throw new DuplicateJobError(definition.name);
    }

    const job = new RegisteredJob(definition);

    if (job.policy.tenancy === 'per-tenant' && !this.runner.knowsTenants()) {
      throw new InvalidJobScheduleError(
        `${job.name} runs per tenant: give the scheduler a TenantDirectory (option tenants) to say which.`,
      );
    }

    this.jobs.set(job.name, job);

    if (this.phase === 'started') {
      void this.follow(job, this.begin(job));
    }
  }

  /** Starting twice does nothing; a start asked while the scheduler stops begins once the stop ended. */
  start(): Promise<void> {
    return this.inTurn(async () => {
      if (this.phase === 'started') {
        return;
      }

      this.phase = 'started';
      await Promise.all([...this.jobs.values()].map((job) => this.follow(job, this.begin(job))));
    });
  }

  stop(): Promise<void> {
    return this.inTurn(async () => {
      this.phase = 'stopping';

      for (const job of this.jobs.values()) {
        job.stopSleeping();
      }

      await Promise.all(this.ticks);

      const cancelAbort = this.settings.timers.schedule(this.settings.graceMs, () => {
        for (const job of this.jobs.values()) {
          job.abort();
        }
      });

      await Promise.all([...this.jobs.values()].map((job) => job.settled()));
      cancelAbort();
      this.phase = 'stopped';
    });
  }

  async runNow(name: string): Promise<JobRun> {
    const job = this.jobs.get(name);

    if (job === undefined) {
      throw new UnknownJobError(name);
    }

    return this.trigger(job, { scheduledAt: this.settings.clock.now(), manual: true });
  }

  describe(): readonly JobDescription[] {
    return [...this.jobs.values()].map((job) => job.describe(this.phase === 'started'));
  }

  /** Runs `change` once the start or the stop in progress ended, whether it ended well or not. */
  private inTurn(change: () => Promise<void>): Promise<void> {
    this.lifecycle = this.lifecycle.then(change, change);

    return this.lifecycle;
  }

  /** A tick never rejects: what goes wrong while following a job is logged, and the others go on. */
  private follow(job: RegisteredJob, tick: Promise<void>): Promise<void> {
    const followed = tick.catch((error: unknown) => {
      this.recorder.fault(job, error);
    });

    this.ticks.add(followed);

    return followed.finally(() => this.ticks.delete(followed));
  }

  private async begin(job: RegisteredJob): Promise<void> {
    if (!job.policy.enabled) {
      return;
    }

    job.followFrom((await this.remembered(job)) ?? this.settings.clock.now());
    await this.tick(job);
  }

  /** A checkpoint that cannot be read is no reason to leave the job asleep: it starts from now. */
  private async remembered(job: RegisteredJob): Promise<Date | undefined> {
    try {
      return await this.settings.checkpoints?.read(job.name);
    } catch (error) {
      this.recorder.fault(job, error);

      return undefined;
    }
  }

  private async tick(job: RegisteredJob): Promise<void> {
    try {
      await this.handleDue(job);
    } finally {
      this.sleep(job);
    }
  }

  private async handleDue(job: RegisteredJob): Promise<void> {
    const reached = job.reach(this.settings.clock.now(), this.settings.lateAfterMs);

    if (reached === undefined) {
      return;
    }

    const { due, run, missed } = reached;

    if (missed !== undefined) {
      this.recorder.notRun(job, missed, 'missed');
    }

    if (run !== undefined) {
      void this.trigger(job, run);
    }

    await this.settings.checkpoints?.write(job.name, due);
  }

  private sleep(job: RegisteredJob): void {
    const next = job.nextRunAt();

    if (this.phase !== 'started' || next === undefined) {
      return;
    }

    const { clock, timers, random } = this.settings;
    const untilNext = next.getTime() - clock.now().getTime();
    const jitter = Math.floor(random() * (job.policy.jitterMs + 1));

    job.sleep(
      timers.schedule(Math.min(Math.max(0, untilNext), LONGEST_SLEEP_MS) + jitter, () => {
        void this.follow(job, this.tick(job));
      }),
    );
  }

  /** A run that waited behind another is dropped when the scheduler is stopping. */
  private trigger(job: RegisteredJob, occurrence: Occurrence): Promise<JobRun> {
    return job.admit({
      now: () => this.runner.run(job, occurrence),
      afterPrevious: () =>
        this.phase === 'stopping' ? this.recorder.notRun(job, occurrence, 'missed') : this.runner.run(job, occurrence),
      skipped: () => this.recorder.notRun(job, occurrence, 'skipped-overlap'),
    });
  }
}

function tenantsOf({ tenants }: InProcessJobSchedulerOptions): { readonly tenants?: TenantDirectory } {
  return tenants === undefined ? {} : { tenants };
}
