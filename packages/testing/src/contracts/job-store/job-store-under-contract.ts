import type { EnqueuedBy, EnqueuedJob, JobProgress, QueuedJob } from '@ddd-ts-kit/kernel';

interface Lease {
  readonly id: string;
  /** The claim it is of: the claims of a job are counted from 1 and never given back. */
  readonly claim: number;
}

interface Claimed {
  readonly id: string;
  readonly name: string;
  readonly queue: string;
  readonly payload: unknown;
  readonly enqueuedBy: EnqueuedBy;
  readonly enqueuedAt: Date;
  readonly attempt: number;
  readonly lease: Lease;
  readonly checkpoint?: unknown;
}

/**
 * The job store port of `@ddd-ts-kit/scheduling`, restated structurally so that this package
 * does not depend on it. Any `JobStore` fits.
 */
export interface JobStoreUnderContract {
  add(job: {
    readonly id: string;
    readonly name: string;
    readonly queue: string;
    readonly payload: unknown;
    readonly enqueuedBy: EnqueuedBy;
    readonly enqueuedAt: Date;
    readonly runAt: Date;
    readonly idempotencyKey?: string;
    readonly subject?: string;
  }): Promise<EnqueuedJob>;
  claim(request: { queue: string; limit: number; now: Date; leaseMs: number }): Promise<Claimed[]>;
  heartbeat(lease: Lease, leaseUntil: Date): Promise<boolean>;
  update(lease: Lease, update: { progress?: JobProgress; checkpoint?: unknown }, leaseUntil: Date): Promise<boolean>;
  complete(lease: Lease, at: Date): Promise<boolean>;
  fail(lease: Lease, failure: { errorCode: string; retryAt: Date | null; at: Date }): Promise<boolean>;
  release(lease: Lease, runAt: Date): Promise<boolean>;
  cancel(id: string, at: Date): Promise<boolean>;
  find(id: string): Promise<QueuedJob | undefined>;
  retryDead(ids: readonly string[], now: Date): Promise<number>;
  purgeFinished(before: Date): Promise<number>;
  eraseSubject(subject: string): Promise<number>;
  stats(queue: string): Promise<{ readonly waiting: number; readonly running: number; readonly dead: number }>;
}
