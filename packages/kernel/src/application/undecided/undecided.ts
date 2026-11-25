import { UndecidedError } from './undecided-error';

/**
 * The refusal of a stub, named after what is left to decide:
 * `throw undecided('what "confirm order" does')`.
 */
export function undecided(what: string): UndecidedError {
  return new UndecidedError(what);
}
