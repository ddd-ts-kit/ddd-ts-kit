import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ConcurrencyError,
  ConflictError,
  FileError,
  INVALID_CRITERIA,
  INVALID_PAGE_REQUEST,
  InvariantViolation,
  type KitCode,
  KitCodes,
  NotFoundError,
  PRECONDITION_FAILED,
  SERVICE_UNAVAILABLE,
} from '../src';
import { refusalCodesOfSources } from './support/refusal-codes-of-sources';

describe('the code list of the kit', () => {
  it('names each code by its words, one key per code', () => {
    const codes = Object.values(KitCodes);

    expect(new Set(codes).size).toBe(codes.length);

    for (const [key, code] of Object.entries(KitCodes)) {
      expect(code.toLowerCase().replaceAll('_', ''), key).toBe(key.toLowerCase());
    }
  });

  it('holds the codes the refusals of the kernel carry', () => {
    expect(new NotFoundError('nothing').code).toBe(KitCodes.NotFound);
    expect(new ConflictError('taken').code).toBe(KitCodes.Conflict);
    expect(new InvariantViolation('broken').code).toBe(KitCodes.InvariantViolation);
    expect(new ConcurrencyError('a-1').code).toBe(KitCodes.ConcurrencyConflict);
    expect(FileError.notFound('k').code).toBe(KitCodes.FileNotFound);

    expect([INVALID_CRITERIA, INVALID_PAGE_REQUEST, PRECONDITION_FAILED, SERVICE_UNAVAILABLE]).toEqual([
      KitCodes.InvalidCriteria,
      KitCodes.InvalidPageRequest,
      KitCodes.PreconditionFailed,
      KitCodes.ServiceUnavailable,
    ]);
  });

  it('holds the code of every refusal the kernel raises, read in its sources', () => {
    const raised = refusalCodesOfSources();
    const known: readonly string[] = Object.values(KitCodes);

    expect(raised).toEqual(expect.arrayContaining(['CONCURRENCY_CONFLICT', 'FILE_NOT_FOUND', 'NOT_FOUND']));
    expect(raised.filter((code) => !known.includes(code))).toEqual([]);
  });

  it('types a code as one of them', () => {
    expectTypeOf(KitCodes.Forbidden).toEqualTypeOf<'FORBIDDEN'>();
    expectTypeOf<'FORBIDDEN'>().toExtend<KitCode>();
    expectTypeOf<'FORBIDEN'>().not.toExtend<KitCode>();
  });
});
