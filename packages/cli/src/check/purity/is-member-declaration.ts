import { matchingBracket } from '../text/matching-bracket';
import { significantAfter } from './text/significant-after';
import { significantBefore } from './text/significant-before';
import type { Span } from './text/span';
import { wordBefore } from './text/word-before';

/** A word that only the declaration of a member follows, never a call. */
const DECLARES_A_MEMBER = new Set([
  'abstract',
  'static',
  'public',
  'private',
  'protected',
  'override',
  'declare',
  'async',
  'get',
  'set',
]);

/** What a member starts after, in the body of a class, of an interface or of an object. */
const BEFORE_A_MEMBER = ['', '{', ';', '}', ','];

/**
 * Whether the name before this parenthesis is a method declared there, not a global called:
 * `abstract fetch(id: string): Promise<string>;` in a port, `fetch(id) { .. }` in its adapter.
 * A body follows only a declaration; a return type follows one where a member may start.
 */
export function isMemberDeclaration(code: string, name: Span, parenthesis: number): boolean {
  const after = code.charAt(significantAfter(code, matchingBracket(code, parenthesis) + 1));
  const before = code.charAt(significantBefore(code, name.start));

  return (
    DECLARES_A_MEMBER.has(wordBefore(code, name.start)) ||
    after === '{' ||
    (after === ':' && BEFORE_A_MEMBER.includes(before))
  );
}
