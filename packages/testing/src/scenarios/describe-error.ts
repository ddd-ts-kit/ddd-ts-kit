import { codeOf } from './code-of';
import { errorClassOf } from './error-class-of';
import { isErrorLike } from './is-error-like';
import { show } from './show';

/** A failure as a message quotes it: its class, its code when it carries one, its message; anything else as it is. */
export function describeError(error: unknown): string {
  if (!isErrorLike(error)) {
    return show(error);
  }

  const code = codeOf(error);

  return `${errorClassOf(error)}${code === undefined ? '' : ` (code ${code})`}: ${error.message}`;
}
