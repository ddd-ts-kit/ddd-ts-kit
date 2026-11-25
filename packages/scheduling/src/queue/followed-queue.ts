import type { BackgroundJobRun } from './background-job-run';

/**
 * One queue as a worker follows it: the attempts it runs, the one turn at a time that claims for
 * it, its sleep between two polls and when its depth was last measured. The worker says what a
 * turn does; the queue alone keeps what it takes for no turn to overlap another and no wake-up
 * to be lost.
 */
export class FollowedQueue {
  private readonly attempts = new Set<Promise<BackgroundJobRun>>();

  private filling: Promise<void> | undefined;

  private wokenWhileFilling = false;

  private sleeping: (() => void) | undefined;

  private measuredAt = Number.NEGATIVE_INFINITY;

  constructor(
    readonly name: string,
    readonly concurrency: number,
  ) {}

  /** How many more attempts the queue may run at once. */
  get room(): number {
    return this.concurrency - this.attempts.size;
  }

  /**
   * Runs `turn`, which never rejects, unless one is in progress. Asked while one is, it runs one
   * more after: an attempt that ends while the queue fills is heard.
   */
  async fill(turn: () => Promise<void>): Promise<void> {
    if (this.filling !== undefined) {
      this.wokenWhileFilling = true;

      return;
    }

    this.filling = this.turns(turn);
    await this.filling;
  }

  /** Counts the attempt in the concurrency of the queue until it ends, then tells `onEnd`. */
  run(attempt: Promise<BackgroundJobRun>, onEnd: () => void): void {
    const running = attempt.finally(() => {
      this.attempts.delete(running);
      onEnd();
    });

    this.attempts.add(running);
  }

  /** The queue sleeps until `cancelSleep` is called or its timer fires: one sleep at a time. */
  sleep(cancelSleep: () => void): void {
    this.stopSleeping();
    this.sleeping = cancelSleep;
  }

  /** Cancels the sleep, if any: nothing wakes the queue after. */
  stopSleeping(): void {
    this.sleeping?.();
    this.sleeping = undefined;
  }

  /** Whether the depth is to be measured at `now`: once per `everyMs` at most, and a yes counts as the measure. */
  measuresAt(now: number, everyMs: number): boolean {
    if (now - this.measuredAt < everyMs) {
      return false;
    }

    this.measuredAt = now;

    return true;
  }

  /** Resolves once the turn in progress ended, then the attempts it left running. */
  async settled(): Promise<void> {
    await this.filling;
    await Promise.all(this.attempts);
  }

  private async turns(turn: () => Promise<void>): Promise<void> {
    try {
      do {
        this.wokenWhileFilling = false;
        await turn();
      } while (this.wokenAgain());
    } finally {
      this.filling = undefined;
    }
  }

  /** Read anew after an await: an attempt may have ended while the turn went on. */
  private wokenAgain(): boolean {
    return this.wokenWhileFilling;
  }
}
