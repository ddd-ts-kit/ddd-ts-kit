import { describe, expect, it } from 'vitest';
import { JobLease } from '../src';

describe('the lease of a job', () => {
  it('is of one claim of one job', () => {
    expect(JobLease.ofClaim('job-1', 3)).toEqual({ id: 'job-1', claim: 3 });
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses a claim that is not counted from 1: %s', (claim) => {
    expect(() => JobLease.ofClaim('job-1', claim)).toThrow(
      new RangeError(`The lease of job job-1 is of a claim counted from 1, not of ${String(claim)}.`),
    );
  });
});
