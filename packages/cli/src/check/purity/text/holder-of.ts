import { BRACKETS } from '../../text/brackets';
import { matchingBracket } from '../../text/matching-bracket';
import type { Span } from './span';

/** The pair of brackets that holds this offset most closely, brackets included; undefined at the top of the source. */
export function holderOf(code: string, at: number): Span | undefined {
  let closed = 0;

  for (let offset = at - 1; offset >= 0; offset -= 1) {
    const char = code.charAt(offset);

    if (BRACKETS.closers.includes(char)) {
      closed += 1;
    } else if (BRACKETS.openers.includes(char) && (closed -= 1) < 0) {
      return { start: offset, end: matchingBracket(code, offset) + 1 };
    }
  }

  return undefined;
}
