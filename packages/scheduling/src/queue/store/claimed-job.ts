import type { EnqueuedBy } from '@ddd-ts-kit/kernel';
import type { JobLease } from './job-lease';

/** A job handed to a worker, with what its run needs. */
export interface ClaimedJob {
  readonly id: string;
  readonly name: string;
  readonly queue: string;
  readonly payload: unknown;
  readonly enqueuedBy: EnqueuedBy;
  readonly enqueuedAt: Date;
  /** The attempt this claim counts: 1 the first time, and the same again after a release or a revival. */
  readonly attempt: number;
  /** What this claim holds the job under, to name in every report of its run. */
  readonly lease: JobLease;
  /** What an earlier attempt saved, absent on a fresh start. */
  readonly checkpoint?: unknown;
}
