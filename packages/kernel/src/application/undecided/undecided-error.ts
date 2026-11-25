/** The code of what was generated and is not written yet: answered 501. */
export const NOT_IMPLEMENTED = 'NOT_IMPLEMENTED';

/**
 * What a generated stub answers until its decision is written: it refuses by name, where a
 * success that did nothing would pass for the behaviour. A fault of the software, not a business
 * refusal: a route answers it 501, a reaction or a job fails with it, the error reporting sees it.
 */
export class UndecidedError extends Error {
  readonly code = NOT_IMPLEMENTED;

  constructor(what: string) {
    super(`${what} is not decided yet: its TODO says what to write`);
    this.name = 'UndecidedError';
  }
}
