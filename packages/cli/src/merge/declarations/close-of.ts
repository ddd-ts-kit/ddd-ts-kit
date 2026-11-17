const OPENERS = '([{';
const CLOSERS = ')]}';

/** Where the group that holds a place closes. */
export function closeOf(code: string, from: number): number {
  let depth = 0;

  for (let close = from; close < code.length; close += 1) {
    const character = code.charAt(close);

    if (CLOSERS.includes(character) && depth === 0) {
      return close;
    }

    depth += OPENERS.includes(character) ? 1 : CLOSERS.includes(character) ? -1 : 0;
  }

  return code.length;
}
