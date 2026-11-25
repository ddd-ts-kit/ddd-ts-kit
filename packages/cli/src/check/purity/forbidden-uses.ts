import type { Scan } from '../scan/scan';
import { afterTypeParameters } from '../text/after-type-parameters';
import { ambientMentions } from './ambient-mentions';
import type { ForbiddenUse } from './forbidden-use';
import { isMemberDeclaration } from './is-member-declaration';
import { keysTakenFrom } from './keys-taken-from';
import { memberAfter } from './member-after';
import type { Mention } from './mention';
import { forbiddenCall } from './reference/forbidden-call';
import { forbiddenConstruction } from './reference/forbidden-construction';
import { forbiddenMember } from './reference/forbidden-member';
import type { PurityTable } from './reference/purity-table';
import { significantAfter } from './text/significant-after';
import { significantBefore } from './text/significant-before';
import { wordBefore } from './text/word-before';

/** Each use the code of a source makes of a global the table forbids: a construction, a member read or taken by destructuring, a call. */
export function forbiddenUses(scan: Scan, table: PurityTable): ForbiddenUse[] {
  const { code } = scan;

  return ambientMentions(code, watchedBy(table)).flatMap((mention) => {
    if (wordBefore(code, mention.start) === 'new') {
      return construction(code, table, mention);
    }

    return [...memberRead(scan, table, mention), ...membersTaken(scan, table, mention), ...call(code, table, mention)];
  });
}

/** The globals the table has something to say about. */
function watchedBy(table: PurityTable): string[] {
  return [...Object.keys(table.members), ...table.calls, ...table.constructions, ...table.bareConstructions];
}

/** `new WebSocket(url)` and `new Date()`, reported where the `new` stands. */
function construction(code: string, table: PurityTable, mention: Mention): ForbiddenUse[] {
  const given = significantAfter(code, mention.end);
  const hasArguments = code.charAt(given) === '(' && code.charAt(significantAfter(code, given + 1)) !== ')';
  const keyword = significantBefore(code, mention.start) - 'new'.length + 1;

  return use(keyword, forbiddenConstruction(table, mention.name, hasArguments));
}

/** `process.env`, `process?.env` and `process['env']`. */
function memberRead(scan: Scan, table: PurityTable, mention: Mention): ForbiddenUse[] {
  return use(mention.start, forbiddenMember(table, mention.name, memberAfter(scan, mention.end)));
}

/** `const { env } = process`, each key reported where it is written. */
function membersTaken(scan: Scan, table: PurityTable, mention: Mention): ForbiddenUse[] {
  return keysTakenFrom(scan, mention.start).flatMap(({ name, at }) => {
    return use(at, forbiddenMember(table, mention.name, name));
  });
}

/** `fetch(url)`, and not the method a class declares under that name. */
function call(code: string, table: PurityTable, mention: Mention): ForbiddenUse[] {
  return isCalled(code, mention) ? use(mention.start, forbiddenCall(table, mention.name)) : [];
}

/** Whether arguments follow the mention, `fetch(url)` or `fetch?.(url)`, and no body or return type makes it a method. */
function isCalled(code: string, mention: Mention): boolean {
  const next = significantAfter(code, afterTypeParameters(code, mention.end));
  const parenthesis = code.startsWith('?.', next) ? significantAfter(code, next + 2) : next;

  return code.charAt(parenthesis) === '(' && !isMemberDeclaration(code, mention, parenthesis);
}

/** The use at this offset, when the table has a name for it. */
function use(at: number, what: string | undefined): ForbiddenUse[] {
  return what === undefined ? [] : [{ at, what }];
}
