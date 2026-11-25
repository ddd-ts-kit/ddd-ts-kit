import { JobLease, type ClaimedJob } from '@ddd-ts-kit/scheduling';
import type { JobRow } from './job-row';

/** A row read before its claim was written, as the worker receives it: the attempt and the lease of this claim counted. */
export function claimedOfRow(row: JobRow): ClaimedJob {
  return {
    id: row.id,
    name: row.name,
    queue: row.queue,
    payload: row.payload,
    enqueuedBy: row.enqueued_by,
    enqueuedAt: new Date(row.enqueued_at),
    attempt: row.attempts + 1,
    lease: JobLease.ofClaim(row.id, row.claims + 1),
    ...(row.checkpoint === null ? {} : { checkpoint: row.checkpoint }),
  };
}
