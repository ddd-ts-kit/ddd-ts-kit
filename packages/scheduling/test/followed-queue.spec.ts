import { describe, expect, it } from 'vitest';
import { FollowedQueue } from '../src/queue/followed-queue';

/** A turn the test ends by hand, and how many were started. */
function heldTurns() {
  const ends: (() => void)[] = [];

  const turn = () =>
    new Promise<void>((resolve) => {
      ends.push(resolve);
    });

  return { turn, started: () => ends.length, end: (index: number) => ends[index]?.() };
}

describe('a queue a worker follows', () => {
  it('runs one turn at a time, and one more for every wake-up that came during a turn', async () => {
    const queue = new FollowedQueue('billing', 1);
    const turns = heldTurns();
    const filling = queue.fill(turns.turn);

    await queue.fill(turns.turn);
    await queue.fill(turns.turn);
    expect(turns.started()).toBe(1);

    turns.end(0);
    await Promise.resolve();
    expect(turns.started()).toBe(2);

    turns.end(1);
    await filling;
    expect(turns.started()).toBe(2);
  });

  it('counts an attempt in its room until the attempt ends', async () => {
    const queue = new FollowedQueue('billing', 2);
    const ended: string[] = [];
    let end: () => void = () => undefined;

    const attempt = new Promise<void>((resolve) => {
      end = resolve;
    }).then(() => ({
      job: 'billing.compile-statements',
      jobId: 'job-1',
      attempt: 1,
      outcome: 'succeeded' as const,
      startedAt: new Date('2026-03-02T10:00:00.000Z'),
      durationMs: 0,
      correlationId: 'corr-1',
    }));

    queue.run(attempt, () => ended.push('job-1'));
    expect(queue.room).toBe(1);

    end();
    await queue.settled();
    expect([queue.room, ended]).toEqual([2, ['job-1']]);
  });

  it('measures its depth once per interval at most, and sleeps one sleep at a time', () => {
    const queue = new FollowedQueue('billing', 1);
    const cancelled: string[] = [];

    expect([queue.measuresAt(1_000, 500), queue.measuresAt(1_499, 500), queue.measuresAt(1_500, 500)]).toEqual([
      true,
      false,
      true,
    ]);

    queue.sleep(() => cancelled.push('first'));
    queue.sleep(() => cancelled.push('second'));
    expect(cancelled).toEqual(['first']);

    queue.stopSleeping();
    queue.stopSleeping();
    expect(cancelled).toEqual(['first', 'second']);
  });
});
