import { escapeRegExp } from '../text/escape-reg-exp';
import { localScopes } from './local-scopes';
import type { Mention } from './mention';
import { GLOBAL_OBJECTS } from './reference/global-objects';
import { significantAfter } from './text/significant-after';
import { significantBefore } from './text/significant-before';
import type { Span } from './text/span';
import { wordBefore } from './text/word-before';

/** After one of these words a parenthesis groups an expression; after any other word it calls. */
const BEFORE_A_GROUP = new Set([
  'new',
  'return',
  'await',
  'typeof',
  'void',
  'throw',
  'yield',
  'case',
  'delete',
  'in',
  'of',
]);

/**
 * The places where a source names one of these globals and means the global: by its name or
 * through the global object (`globalThis.fetch`), never as the member of another object
 * (`this.reader.fetch`) nor where the source binds the name itself (a parameter `console`).
 */
export function ambientMentions(code: string, names: readonly string[]): Mention[] {
  const isLocal = localNamesOf(code);

  return [...code.matchAll(anyOf(names))].flatMap(({ 0: name, index }) => {
    const head = headOf(code, { name, start: index, end: index + name.length });

    return head === undefined || isLocal(head) ? [] : [{ name, ...withoutParentheses(code, head) }];
  });
}

function anyOf(names: readonly string[]): RegExp {
  return new RegExp(`(?<![\\w$])(?:${names.map(escapeRegExp).join('|')})(?![\\w$])`, 'g');
}

/** Whether the first name of a mention is bound by the source where it stands, the scopes of a name read once. */
function localNamesOf(code: string): (head: Mention) => boolean {
  const scopes = new Map<string, readonly Span[]>();

  return ({ name, start }) => {
    const known = scopes.get(name) ?? localScopes(code, name);

    scopes.set(name, known);

    return known.some((scope) => scope.start <= start && start < scope.end);
  };
}

/**
 * The mention from its first name on: the name itself, or the global object it is taken from.
 * Undefined when the name is the member of anything else.
 */
function headOf(code: string, named: Mention): Mention | undefined {
  if (!isMember(code, named.start)) {
    return named;
  }

  const object = wordBefore(code, objectEnd(code, named.start));
  const start = code.lastIndexOf(object, named.start);

  return GLOBAL_OBJECTS.includes(object) && !isMember(code, start)
    ? { name: object, start, end: named.end }
    : undefined;
}

/** Whether a dot stands before the name, the three of a spread apart. */
function isMember(code: string, start: number): boolean {
  const dot = significantBefore(code, start);

  return code.charAt(dot) === '.' && code.slice(dot - 2, dot) !== '..';
}

/** Where the object ends whose member starts at `start`, `.` and `?.` stepped over. */
function objectEnd(code: string, start: number): number {
  const dot = significantBefore(code, start);

  return code.charAt(dot - 1) === '?' ? dot - 1 : dot;
}

/** `(Date)` names what `Date` names: the mention grows over the parentheses that only group it. */
function withoutParentheses(code: string, mention: Span): Span {
  const open = significantBefore(code, mention.start);
  const close = significantAfter(code, mention.end);

  return code.charAt(open) === '(' && code.charAt(close) === ')' && groups(code, open)
    ? withoutParentheses(code, { start: open, end: close + 1 })
    : { start: mention.start, end: mention.end };
}

function groups(code: string, parenthesis: number): boolean {
  const before = code.charAt(significantBefore(code, parenthesis));

  return !/[\w$)\]]/.test(before) || BEFORE_A_GROUP.has(wordBefore(code, parenthesis));
}
