import { describe, expect, it } from 'vitest';
import { undecided } from '@ddd-ts-kit/kernel';
import { DEFAULT_ERROR_MAPPING, createErrorMapper, toProblem } from '../src';

describe('the default error mapping', () => {
  it('knows the default codes', () => {
    expect(DEFAULT_ERROR_MAPPING).toEqual({
      VALIDATION_FAILED: 422,
      NOT_FOUND: 404,
      CONFLICT: 409,
      CONCURRENCY_CONFLICT: 409,
      INVARIANT_VIOLATION: 422,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_ACCEPTABLE: 406,
      PRECONDITION_FAILED: 412,
      PRECONDITION_REQUIRED: 428,
      FILE_NOT_FOUND: 404,
      FILE_TOO_LARGE: 413,
      UNSUPPORTED_MEDIA_TYPE: 415,
      SERVICE_UNAVAILABLE: 503,
      NOT_IMPLEMENTED: 501,
    });
  });

  it('answers a use case generated and not written yet 501, with nothing of its message', () => {
    const problem = toProblem(undecided('what "confirm order" does'), createErrorMapper(), 'req-1');

    expect(problem).toMatchObject({ status: 501, title: 'Not Implemented', code: 'NOT_IMPLEMENTED' });
    expect(JSON.stringify(problem)).not.toContain('confirm order');
  });
});
