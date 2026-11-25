import { describe, expect, it } from 'vitest';
import { DomainError } from '@ddd-ts-kit/kernel';
import { createErrorMapper, toProblem } from '../src';

/** Names every object inherits: none of them is a code the mapping names. */
const INHERITED = ['constructor', 'toString', 'hasOwnProperty', '__proto__'];

describe('a code that is the name of something every object inherits', () => {
  const mapper = createErrorMapper();

  it.each(INHERITED)('is a code nobody mapped for a domain error: %s answers the fallback status', (code) => {
    class Inherited extends DomainError {
      readonly code = code;
    }

    expect(mapper.statusOf(code)).toBe(422);
    expect(toProblem(new Inherited('refused'), mapper, 'req-1')).toMatchObject({ status: 422, code });
  });

  it.each(INHERITED)('is no server status for an unexpected error: %s answers 500 INTERNAL_ERROR', (code) => {
    const problem = toProblem(Object.assign(new Error('driver failure'), { code }), mapper, 'req-1');

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId: 'req-1',
    });
  });
});
