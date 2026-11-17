import { closeOf } from './close-of';

/** A bracket group of some code: where it opens and where it closes, the end of the code when nothing closes it. */
export interface Group {
  readonly open: number;
  readonly close: number;
}

const OPENERS = '([{';
const CLOSERS = ')]}';

/** The innermost bracket group that holds a place of some code, comments and strings left out; undefined outside any. */
export function enclosingGroup(code: string, at: number): Group | undefined {
  let depth = 0;

  for (let open = at - 1; open >= 0; open -= 1) {
    const character = code.charAt(open);

    if (OPENERS.includes(character) && depth === 0) {
      return { open, close: closeOf(code, at) };
    }

    depth += CLOSERS.includes(character) ? 1 : OPENERS.includes(character) ? -1 : 0;
  }

  return undefined;
}
