import {
  describeJobSchedule,
  jobPolicy,
  parseJobSchedule,
  type JobDefinition,
  type JobDescription,
  type JobPolicy,
  type JobRun,
  type Lock,
  type LockHandle,
  type ParsedJobSchedule,
} from '@ddd-ts-kit/kernel';
import { JobAbortedError } from './errors/job-aborted-error';
import type { Occurrence } from './occurrence';
import { latestOccurrence } from './occurrences/latest-occurrence';
import { nextOccurrence } from './occurrences/next-occurrence';

/** What became due when the scheduler woke for a job. */
export interface Reached {
  /** The latest occurrence due: the job is now past it. */
  readonly due: Date;
  /** The occurrence to run: the latest, when it is on time or owed. */
  readonly run?: Occurrence;
  /** The first occurrence passed over, when one was. */
  readonly missed?: Occurrence;
}

/** What the scheduler does with an occurrence, for each answer of the overlap policy. */
export interface Admission {
  readonly now: () => Promise<JobRun>;
  readonly afterPrevious: () => JobRun | Promise<JobRun>;
  readonly skipped: () => JobRun;
}

/**
 * A job as this instance follows it: where it stands in its schedule, its sleep until the next
 * occurrence, the run in progress and the one waiting behind it, the lock of the last occurrence
 * and what became of it. The scheduler, the runner and the recorder say what happens; the job
 * alone keeps what its policy makes of it. Held by the scheduler alone.
 */
export class RegisteredJob {
  readonly name: string;

  readonly policy: JobPolicy;

  readonly schedule: ParsedJobSchedule;

  private readonly scheduleText: string;

  /** The last occurrence handled, or the instant the scheduler started following the job. */
  private cursor: Date | undefined;

  private sleeping: (() => void) | undefined;

  /** The run in progress, or the one waiting behind it. */
  private active: Promise<JobRun> | undefined;

  private waiting = false;

  private lastRun: JobRun | undefined;

  /** The lock of the last occurrence run, kept until the next one so that no instance runs it again. */
  private held: LockHandle | undefined;

  private aborting: ((reason: Error) => void) | undefined;

  constructor(readonly definition: JobDefinition) {
    this.name = definition.name;
    this.policy = jobPolicy(definition);
    this.schedule = parseJobSchedule(definition.schedule);
    this.scheduleText = describeJobSchedule(definition.schedule);
  }

  /** The occurrences after `instant` are the ones due from now on. */
  followFrom(instant: Date): void {
    this.cursor = instant;
  }

  /** The next occurrence, once the job is followed. */
  nextRunAt(): Date | undefined {
    return this.cursor === undefined ? undefined : nextOccurrence(this.schedule, this.cursor);
  }

  /**
   * Of the occurrences that became due at `now`, the latest is run when it is on time or owed, the
   * others are missed: the job moves past them all. Nothing became due: undefined.
   */
  reach(now: Date, lateAfterMs: number): Reached | undefined {
    const after = this.cursor ?? now;
    const due = latestOccurrence(this.schedule, { after, notAfter: now });

    if (due === undefined) {
      return undefined;
    }

    this.cursor = due;

    const earliest = nextOccurrence(this.schedule, after);
    const late = now.getTime() - due.getTime() > lateAfterMs + this.policy.jitterMs;
    const runs = !late || this.policy.missed === 'run-once';
    const passedOver = !runs || earliest.getTime() < due.getTime();

    return {
      due,
      ...(runs ? { run: { scheduledAt: due, manual: false } } : {}),
      ...(passedOver ? { missed: { scheduledAt: earliest, manual: false } } : {}),
    };
  }

  /** The job sleeps until `cancelSleep` is called or its timer fires: one sleep at a time. */
  sleep(cancelSleep: () => void): void {
    this.stopSleeping();
    this.sleeping = cancelSleep;
  }

  /** Cancels the sleep, if any: nothing wakes the job after. */
  stopSleeping(): void {
    this.sleeping?.();
    this.sleeping = undefined;
  }

  /**
   * An occurrence runs now when nothing runs, after the run in progress when the job queues and
   * none waits yet, and is skipped otherwise. The job is running until what it admitted ended.
   */
  admit({ now, afterPrevious, skipped }: Admission): Promise<JobRun> {
    const previous = this.active;

    if (previous === undefined) {
      return this.occupy(now());
    }

    if (this.policy.overlap === 'skip' || this.waiting) {
      return Promise.resolve(skipped());
    }

    this.waiting = true;

    return this.occupy(
      previous.then(() => {
        this.waiting = false;

        return afterPrevious();
      }),
    );
  }

  /**
   * Takes the lock of an occurrence, kept until the next one. The lock of the previous occurrence
   * is let go first, at best: one that cannot be released ends at its time to live.
   */
  async hold(lock: Lock, key: string, ttlMs: number): Promise<boolean> {
    const previous = this.held;

    this.held = undefined;
    await previous?.release().catch(() => undefined);
    this.held = await lock.acquire(key, { ttlMs });

    return this.held !== undefined;
  }

  /** Until the answered function says the run ended, `abort()` aborts it through `controller`. */
  abortsThrough(controller: AbortController): () => void {
    this.aborting = (reason) => {
      controller.abort(reason);
    };

    return () => {
      this.aborting = undefined;
    };
  }

  /** Aborts the run in progress, if any: the scheduler stops and waits no longer. */
  abort(): void {
    this.aborting?.(new JobAbortedError(this.name));
  }

  /** What became of the last occurrence, whatever it was. */
  handled(run: JobRun): void {
    this.lastRun = run;
  }

  /** Resolves once the run in progress ended, and the one waiting behind it. */
  async settled(): Promise<void> {
    await this.active;
  }

  /** `followed`: whether the scheduler follows the job now, which alone gives it a next run. */
  describe(followed: boolean): JobDescription {
    const nextRunAt = followed ? this.nextRunAt() : undefined;

    return {
      name: this.name,
      schedule: this.scheduleText,
      enabled: this.policy.enabled,
      running: this.active !== undefined,
      ...(nextRunAt === undefined ? {} : { nextRunAt }),
      ...(this.lastRun === undefined ? {} : { lastRun: this.lastRun }),
    };
  }

  private occupy(run: Promise<JobRun>): Promise<JobRun> {
    const active = run.finally(() => {
      if (this.active === active) {
        this.active = undefined;
      }
    });

    this.active = active;

    return active;
  }
}
