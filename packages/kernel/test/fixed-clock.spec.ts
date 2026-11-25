import { describe, expect, it } from 'vitest';
import { FixedClock } from '../src';

const NOON = '2026-03-01T12:00:00.000Z';

describe('FixedClock', () => {
  it('answers the instant it was given, and moves only when advanced', () => {
    const clock = new FixedClock(new Date(NOON));

    expect(clock.now().toISOString()).toBe(NOON);

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe('2026-03-01T12:01:00.000Z');
  });

  it('does not move when the date it answered is changed', () => {
    const clock = new FixedClock(new Date(NOON));

    clock.now().setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe(NOON);
    expect(clock.now()).not.toBe(clock.now());
  });

  it('does not move when the date it was given is changed', () => {
    const seed = new Date(NOON);
    const clock = new FixedClock(seed);

    seed.setUTCFullYear(1980);

    expect(clock.now().toISOString()).toBe(NOON);
  });
});
