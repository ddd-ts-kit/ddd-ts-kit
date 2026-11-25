import { ContractSuite } from '../contract-suite';
import { aJob } from './a-job';
import { LEASE_MS, NOW, QUEUE } from './job-fixtures';
import { later } from './later';
import type { JobStoreUnderContract } from './job-store-under-contract';

const FIRST = { id: 'job-1', claim: 1 };

const SECOND = { id: 'job-1', claim: 2 };

/** What a worker reports of an attempt: progress and checkpoint, success, failure, release. Only the claim that holds the job is heard. */
export class ReportSuite extends ContractSuite<JobStoreUnderContract> {
  protected tests(): void {
    this.progress();
    this.outcomes();
    this.deadAndRevived();
    this.released();
    this.stale();
    this.neverLeasedTwice();
  }

  private progress(): void {
    this.it('shows the progress and hands the checkpoint to the next attempt', async () => {
      await this.claimFirst();

      this.holds(
        await this.subject.update(FIRST, { progress: { done: 40, total: 120 } }, later(LEASE_MS)),
        'the progress reported by the attempt that holds the job was refused',
      );

      this.holds(
        await this.subject.update(FIRST, { checkpoint: { after: 'c-1' } }, later(LEASE_MS)),
        'the checkpoint reported by the attempt that holds the job was refused',
      );

      this.expect((await this.subject.find('job-1'))?.progress).toEqual({ done: 40, total: 120 });

      const [resumed] = await this.claim(later(LEASE_MS));

      this.expect([resumed?.attempt, resumed?.checkpoint]).toEqual([2, { after: 'c-1' }]);
    });
  }

  private outcomes(): void {
    this.it('finishes a job that succeeded: never handed out again', async () => {
      await this.claimFirst();

      this.holds(
        await this.subject.complete(FIRST, later(5_000)),
        'the success reported by the attempt that holds the job was refused',
      );

      const job = await this.subject.find('job-1');

      this.expect([job?.status, job?.finishedAt]).toEqual(['succeeded', later(5_000)]);
      this.expect(await this.claim(later(LEASE_MS * 10))).toEqual([]);
      this.expect(await this.subject.stats(QUEUE)).toEqual({ waiting: 0, running: 0, dead: 0 });
    });

    this.it('retries a failed job at its instant, not before, with its error code', async () => {
      await this.claimFirst();

      this.holds(
        await this.subject.fail(FIRST, { errorCode: 'LEDGER_DOWN', retryAt: later(5_000), at: NOW }),
        'the failure reported by the attempt that holds the job was refused',
      );

      const waiting = await this.subject.find('job-1');

      this.expect([waiting?.status, waiting?.lastErrorCode, waiting?.runAt]).toEqual([
        'waiting',
        'LEDGER_DOWN',
        later(5_000),
      ]);

      this.expect(await this.claim(later(4_999))).toEqual([]);
      this.expect((await this.claim(later(5_000)))[0]?.attempt).toBe(2);
    });
  }

  private deadAndRevived(): void {
    this.it('sets a dead job aside, then revives it with a fresh attempt budget', async () => {
      await this.claimFirst();
      await this.subject.fail(FIRST, { errorCode: 'LEDGER_DOWN', retryAt: null, at: NOW });

      this.expect((await this.subject.find('job-1'))?.status).toBe('dead');
      this.expect(await this.subject.stats(QUEUE)).toEqual({ waiting: 0, running: 0, dead: 1 });
      this.expect(await this.claim(later(LEASE_MS * 10))).toEqual([]);
      this.expect(await this.subject.retryDead([], later(1_000))).toBe(0);
      this.expect(await this.subject.retryDead(['job-1', 'unknown'], later(1_000))).toBe(1);

      const [revived] = await this.claim(later(1_000));

      this.expect(revived?.attempt).toBe(1);
    });
  }

  private released(): void {
    this.it('takes a released job back without counting the attempt', async () => {
      await this.claimFirst();

      this.holds(
        await this.subject.release(FIRST, NOW),
        'the release reported by the attempt that holds the job was refused',
      );

      this.expect((await this.subject.find('job-1'))?.status).toBe('waiting');
      this.expect((await this.claim(NOW))[0]?.attempt).toBe(1);
    });
  }

  private stale(): void {
    this.it('ignores an attempt whose lease was taken over', async () => {
      await this.claimFirst();
      await this.claim(later(LEASE_MS));

      this.holds(
        !(await this.subject.update(FIRST, { progress: { done: 1 } }, later(LEASE_MS * 2))),
        'the progress of an attempt whose lease was taken over was accepted',
      );

      this.holds(
        !(await this.subject.complete(FIRST, later(LEASE_MS))),
        'the success of an attempt whose lease was taken over was accepted',
      );

      this.holds(
        !(await this.subject.fail(FIRST, { errorCode: 'X', retryAt: null, at: NOW })),
        'the failure of an attempt whose lease was taken over was accepted',
      );

      this.holds(
        !(await this.subject.release(FIRST, NOW)),
        'the release of an attempt whose lease was taken over was accepted',
      );

      this.expect((await this.subject.find('job-1'))?.status).toBe('running');

      this.holds(
        await this.subject.complete(SECOND, later(LEASE_MS)),
        'the success reported by the attempt that took the lease over was refused',
      );
    });
  }

  private neverLeasedTwice(): void {
    this.it(
      'gives a released job a new lease: the run left behind is not heard, its attempt is given back',
      async () => {
        await this.claimFirst();
        await this.subject.release(FIRST, NOW);

        const [again] = await this.claim(NOW);

        this.expect([again?.attempt, again?.lease]).toEqual([1, SECOND]);
        await this.refusesTheFirstLease('of a run that released the job');

        this.holds(
          await this.subject.update(SECOND, { checkpoint: { after: 'c-2' } }, later(LEASE_MS)),
          'the checkpoint reported by the claim that took a released job was refused',
        );

        this.expect((await this.claim(later(LEASE_MS)))[0]?.checkpoint).toEqual({ after: 'c-2' });
      },
    );

    this.it('gives a revived job a new lease: the run that died with it is not heard', async () => {
      await this.claimFirst();
      await this.subject.fail(FIRST, { errorCode: 'LEDGER_DOWN', retryAt: null, at: NOW });
      await this.subject.retryDead(['job-1'], NOW);

      const [revived] = await this.claim(NOW);

      this.expect([revived?.attempt, revived?.lease]).toEqual([1, SECOND]);
      await this.refusesTheFirstLease('of a run from before the job was revived');

      this.holds(
        await this.subject.complete(SECOND, later(5_000)),
        'the success reported by the claim that took a revived job was refused',
      );
    });
  }

  /** The job is held under its second lease: nothing the first one reports changes it. */
  private async refusesTheFirstLease(run: string): Promise<void> {
    this.holds(
      !(await this.subject.heartbeat(FIRST, later(LEASE_MS * 2))),
      `the heartbeat ${run} was accepted under the lease of the next claim`,
    );

    this.holds(
      !(await this.subject.update(FIRST, { checkpoint: { after: 'c-1' } }, later(LEASE_MS * 2))),
      `the checkpoint ${run} was accepted under the lease of the next claim`,
    );

    this.holds(
      !(await this.subject.complete(FIRST, later(LEASE_MS))),
      `the success ${run} was accepted under the lease of the next claim`,
    );

    this.holds(
      !(await this.subject.fail(FIRST, { errorCode: 'X', retryAt: null, at: NOW })),
      `the failure ${run} was accepted under the lease of the next claim`,
    );

    this.holds(
      !(await this.subject.release(FIRST, NOW)),
      `the release ${run} was accepted under the lease of the next claim`,
    );
  }

  private async claimFirst(): Promise<void> {
    await this.subject.add(aJob('job-1'));
    await this.claim(NOW);
  }

  private claim(now: Date) {
    return this.subject.claim({ queue: QUEUE, limit: 10, now, leaseMs: LEASE_MS });
  }
}
