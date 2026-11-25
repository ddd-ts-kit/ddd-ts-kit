/** What `enqueue` answers. */
export interface EnqueuedJob {
  readonly id: string;
  /** True when a job of the same name and idempotency key, or of the same id, was already there: its id is answered and nothing is added. */
  readonly duplicate: boolean;
}
