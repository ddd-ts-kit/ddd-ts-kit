import { describe, expect, it } from 'vitest';
import { NOT_IMPLEMENTED, UndecidedError, undecided } from '../src';

describe('what a generated stub answers until its decision is written', () => {
  it('refuses by naming what is left to decide', () => {
    const refusal = undecided('what "confirm order" does');

    expect(refusal).toBeInstanceOf(UndecidedError);
    expect(refusal.message).toBe('what "confirm order" does is not decided yet: its TODO says what to write');
    expect(refusal.name).toBe('UndecidedError');
  });

  it('carries the code a route answers 501 with, and is a fault of the software, never a business refusal', () => {
    expect(undecided('the rule').code).toBe(NOT_IMPLEMENTED);
    expect(NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED');
  });
});
