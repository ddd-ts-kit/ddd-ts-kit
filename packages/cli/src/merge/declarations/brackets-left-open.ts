import { BRACKETS } from '../../check/text/brackets';

/**
 * The brackets left open after `code`, read after those `open` holds, each by its kind; undefined
 * when a bracket closes one that was not opened, or one of another kind. Comments and strings
 * are blanked in `code`.
 */
export function bracketsLeftOpen(code: string, open: readonly number[] = []): number[] | undefined {
  const waiting = [...open];

  for (const char of code) {
    const opener = BRACKETS.openers.indexOf(char);
    const closer = BRACKETS.closers.indexOf(char);

    if (opener !== -1) {
      waiting.push(opener);
    } else if (closer !== -1 && waiting.pop() !== closer) {
      return undefined;
    }
  }

  return waiting;
}
