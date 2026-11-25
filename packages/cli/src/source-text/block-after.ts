import { closingBracket } from '../check/text/closing-bracket';

/** What a brace follows when it opens a type or a value, not a block: an annotation, an argument, a default, an arrow. */
const BEFORE_A_VALUE = /(?:[:|&,=?]|=>)$/;

/**
 * Offset of the brace that opens the block declared from `from` in a blanked source: the body of
 * a class after its heritage clause, of a method after its return type. What the way there holds
 * between brackets or angle brackets, and a brace that writes an object type, is stepped over
 * whole; undefined when no block opens.
 */
export function blockAfter(code: string, from: number): number | undefined {
  let angles = 0;

  for (let at = from; at < code.length; at += 1) {
    const char = code.charAt(at);

    if (char === '{' && angles === 0 && !BEFORE_A_VALUE.test(code.slice(from, at).trimEnd())) {
      return at;
    }

    angles += angleStep(char, code.charAt(at - 1));

    if ('([{'.includes(char)) {
      const close = closingBracket(code, at);

      if (close === undefined) {
        return undefined;
      }

      at = close;
    }
  }

  return undefined;
}

/** How a character moves the nesting of angle brackets, the `>` of an arrow left out. */
function angleStep(char: string, previous: string): number {
  if (char === '<') {
    return 1;
  }

  return char === '>' && previous !== '=' ? -1 : 0;
}
