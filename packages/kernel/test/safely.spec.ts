import { describe, expect, it } from 'vitest';
import { safely } from '../src';

describe('safely', () => {
  it('runs what observes', () => {
    const seen: string[] = [];

    safely(() => {
      seen.push('run');
    });

    expect(seen).toEqual(['run']);
  });

  it('keeps the failure of what observes to itself', () => {
    expect(() =>
      safely(() => {
        throw new Error('logger not ready');
      }),
    ).not.toThrow();
  });
});
