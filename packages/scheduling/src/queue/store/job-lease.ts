/**
 * The fence of a claimed job: who may still report on it. The store mints one at each claim, out
 * of a count of the claims of the job that only grows, so no two claims of a job ever hold the
 * same lease. An attempt number cannot be that fence: a release gives it back and a revival
 * starts it again. A run whose job was claimed again holds an older lease, and the store ignores it.
 */
export class JobLease {
  private constructor(
    readonly id: string,
    /** The claim it is of: 1 for the first claim of the job, one more at each claim, never given back. */
    readonly claim: number,
  ) {}

  /** For a store, when it claims: `claim` is how many times the job was claimed, this time counted. */
  static ofClaim(id: string, claim: number): JobLease {
    if (!Number.isSafeInteger(claim) || claim < 1) {
      throw new RangeError(`The lease of job ${id} is of a claim counted from 1, not of ${String(claim)}.`);
    }

    return new JobLease(id, claim);
  }
}
