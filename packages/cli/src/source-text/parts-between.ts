import { BRACKETS } from '../check/text/brackets';
import type { Span } from './span';

/**
 * What the commas of a bracket set apart at its own depth, each part from its first to its last
 * character of code: the entries of an object, the items of a list. `code` is a blanked source, so
 * a comma or a bracket of a comment, a string or a template sets nothing apart.
 */
export function partsBetween(code: string, open: number, close: number): Span[] {
  const parts: Span[] = [];
  let depth = 0;
  let start = open + 1;

  for (let at = open + 1; at <= close; at += 1) {
    const char = code.charAt(at);

    if (at === close || (char === ',' && depth === 0)) {
      parts.push(...written(code, start, at));
      start = at + 1;
    } else if (BRACKETS.openers.includes(char)) {
      depth += 1;
    } else if (BRACKETS.closers.includes(char)) {
      depth -= 1;
    }
  }

  return parts;
}

function written(code: string, start: number, end: number): Span[] {
  const text = code.slice(start, end);
  const trimmed = text.trim();

  return trimmed === ''
    ? []
    : [{ start: start + text.indexOf(trimmed), end: start + text.indexOf(trimmed) + trimmed.length }];
}
