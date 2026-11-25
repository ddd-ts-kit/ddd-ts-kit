import { identifier } from '../text/identifier';
import { bodyAfter } from './text/body-after';
import { holderOf } from './text/holder-of';
import { significantAfter } from './text/significant-after';
import { significantBefore } from './text/significant-before';
import type { Span } from './text/span';
import { wordBefore } from './text/word-before';

const DECLARES = new Set(['const', 'let', 'var', 'function', 'class', 'enum', 'namespace']);
const PARAMETER_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'override']);
/** A parenthesis after one of these holds a condition or the head of a loop, not parameters. */
const NOT_A_SIGNATURE = new Set(['if', 'while', 'switch', 'with', 'for']);

/** What may stand right before and right after a name that a list binds, by the bracket that opens the list. */
const BINDING_PLACES: Readonly<Record<string, { readonly before: string[]; readonly after: string[] }>> = {
  '(': { before: ['(', ','], after: [',', ')', ':', '?', '='] },
  '{': { before: ['{', ',', ':'], after: [',', '}', '='] },
  '[': { before: ['[', ','], after: [',', ']', '='] },
};

/**
 * The stretches of a source in which `name` is the source's own and hides the global of that
 * name: a variable, a function or a class in the block that declares it, a parameter in its
 * signature and its body, a destructured name wherever its pattern binds. Read without a parser,
 * from what stands around each place the name is written.
 */
export function localScopes(code: string, name: string): Span[] {
  return [...code.matchAll(new RegExp(identifier(name), 'g'))].flatMap(({ index }) => {
    return scopeBoundBy(code, { start: index, end: index + name.length }) ?? [];
  });
}

/** The scope a name binds itself in, or a destructuring pattern the names it holds. */
function scopeBoundBy(code: string, target: Span): Span | undefined {
  const holder = holderOf(code, target.start);

  if (DECLARES.has(wordBefore(code, target.start))) {
    return scopeOfDeclaration(code, holder);
  }

  if (code.startsWith('=>', significantAfter(code, target.end))) {
    return { start: target.start, end: bodyAfter(code, target.end) ?? target.end };
  }

  if (holder === undefined || !standsAsBinding(code, target, holder)) {
    return undefined;
  }

  return code.charAt(holder.start) === '(' ? scopeOfParameters(code, holder) : scopeBoundBy(code, holder);
}

/** The block that holds the declaration, or the body of the loop whose head declares it: `for (const each of all) { .. }`. */
function scopeOfDeclaration(code: string, holder: Span | undefined): Span {
  if (holder === undefined) {
    return { start: 0, end: code.length };
  }

  return code.charAt(holder.start) === '('
    ? { start: holder.start, end: bodyAfter(code, holder.end) ?? holder.end }
    : holder;
}

function scopeOfParameters(code: string, parameters: Span): Span | undefined {
  const end = NOT_A_SIGNATURE.has(wordBefore(code, parameters.start)) ? undefined : bodyAfter(code, parameters.end);

  return end === undefined ? undefined : { start: parameters.start, end };
}

/** Whether the target stands in its list where a bound name does: `console` of `(console: Logger)`, `now` of `{ time: now }`. */
function standsAsBinding(code: string, target: Span, holder: Span): boolean {
  const place = BINDING_PLACES[code.charAt(holder.start)];
  const after = significantAfter(code, target.end);
  const compares = code.charAt(after) === '=' && code.charAt(after + 1) === '=';

  return (
    place !== undefined &&
    place.after.includes(code.charAt(after)) &&
    !compares &&
    (place.before.includes(code.charAt(significantBefore(code, target.start))) ||
      PARAMETER_MODIFIERS.has(wordBefore(code, target.start)))
  );
}
