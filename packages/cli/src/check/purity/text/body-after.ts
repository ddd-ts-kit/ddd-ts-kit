import { BRACKETS } from '../../text/brackets';
import { matchingBracket } from '../../text/matching-bracket';
import { significantAfter } from './significant-after';
import { significantBefore } from './significant-before';

const STARTS_A_BODY_OR_A_RETURN_TYPE = [':', '{', '='];
const ENDS_WITHOUT_BODY = [';', '=', ')', ']', '}'];
const ENDS_AN_ANSWER = [';', ',', ')', ']', '}'];
/** A brace after one of these opens an object type, not a body. */
const BEFORE_A_TYPE_LITERAL = [':', '|', '&', '<', ',', '(', '?', '['];

/**
 * Where the body ends that follows a parenthesis closed right before `from`: the block of a
 * function, of a method or of a loop, or what an arrow answers with, a return type stepped over.
 * Undefined when no body follows, as after the arguments of a call.
 */
export function bodyAfter(code: string, from: number): number | undefined {
  let at = significantAfter(code, from);

  if (!STARTS_A_BODY_OR_A_RETURN_TYPE.includes(code.charAt(at))) {
    return undefined;
  }

  while (at < code.length) {
    const char = code.charAt(at);

    if (code.startsWith('=>', at)) {
      return answerEnd(code, at + 2);
    }

    if (char === '{' && !opensTypeLiteral(code, at)) {
      return matchingBracket(code, at) + 1;
    }

    if (ENDS_WITHOUT_BODY.includes(char)) {
      return undefined;
    }

    at = BRACKETS.openers.includes(char) ? matchingBracket(code, at) + 1 : at + 1;
  }

  return undefined;
}

function opensTypeLiteral(code: string, brace: number): boolean {
  return BEFORE_A_TYPE_LITERAL.includes(code.charAt(significantBefore(code, brace)));
}

/** Where what an arrow answers with ends: its block, or its expression up to what closes or separates it. */
function answerEnd(code: string, from: number): number {
  let at = significantAfter(code, from);

  if (code.charAt(at) === '{') {
    return matchingBracket(code, at) + 1;
  }

  while (at < code.length && !ENDS_AN_ANSWER.includes(code.charAt(at))) {
    at = BRACKETS.openers.includes(code.charAt(at)) ? matchingBracket(code, at) + 1 : at + 1;
  }

  return at;
}
