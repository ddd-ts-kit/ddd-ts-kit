import type { Result } from './result';

/** The value of an `Ok`. Throws the error of an `Err`, or an `Error` whose `cause` is what the `Err` held when that is not an error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error
    ? result.error
    : new Error('unwrap() called on an Err result', { cause: result.error });
}
