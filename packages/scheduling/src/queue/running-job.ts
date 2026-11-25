import type { ClaimedJob } from './store/claimed-job';
import type { RegisteredBackgroundJob } from './registered-background-job';

/** One attempt in progress: what it runs, under the lease of its claim, and how to stop it. */
export interface RunningJob {
  readonly job: ClaimedJob;
  readonly registered: RegisteredBackgroundJob;
  readonly controller: AbortController;
  readonly startedAt: Date;
  /** Cancels the next heartbeat. */
  stopBeating: () => void;
}
