import { closeOf } from './close-of';
import { enclosingGroup } from './enclosing-group';

/** Where a member is declared: at the start of a line or after `{`, `,`, `;` or `(`, behind its modifiers. */
const MEMBER_PLACE =
  /(?:^|[\n{,;(])\s*(?:(?:public|private|protected|static|readonly|async|get|set|declare|override|abstract)\s+)*$/;

/** What opens the body a member is declared in. */
const BODY = /\b(class|enum|interface)\b[^;{}]*$/;

/**
 * Whether a name, at a place of some code, declares a member and reads nothing: a key, a member
 * of an interface or of a type, a label, a typed parameter (`orders: 1`, `orders?: Table`), a
 * method or an accessor (`orders() {`), a member of an enum, a field of a class.
 */
export function declaresAMember(code: string, from: number, name: string): boolean {
  const after = code.slice(from + name.length).trimStart();

  if (!MEMBER_PLACE.test(code.slice(0, from))) {
    return false;
  }

  return /^[?!]?:/.test(after) || isMethod(after) || inABody(code, from, after);
}

/** Whether what follows a name is the parameters and the body of a method. */
function isMethod(after: string): boolean {
  return after.startsWith('(') && /^(?::[^{;=]*)?\{/.test(after.slice(closeOf(after, 1) + 1).trimStart());
}

/** Whether a name is a member of an enum, or a field of a class with or without a value. */
function inABody(code: string, from: number, after: string): boolean {
  const group = enclosingGroup(code, from);

  const body =
    group === undefined || code.charAt(group.open) !== '{' ? undefined : BODY.exec(code.slice(0, group.open));

  return body?.[1] === 'enum' || (body !== undefined && body !== null && /^(?:=(?![=>])|;|$)/.test(after));
}
