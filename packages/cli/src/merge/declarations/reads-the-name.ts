import { scan } from '../../check/scan/scan';
import { bindsTheName } from './binds-the-name';
import type { Declaration } from './declaration';
import { declaresAMember } from './declares-a-member';

/**
 * Whether the code of a declaration reads a name: it holds it as a whole word, comments and
 * strings left out, a type that names it and a spread of it among them (`typeof orders`,
 * `...orders`). A member of another value (`other.orders`, `other?.orders`) is not a read of it,
 * nor a member the code declares under that name. No scope is read: a declaration that binds the
 * name itself is not taken to read the outer one at all.
 */
export function readsTheName({ lines }: Declaration, name: string | undefined): boolean {
  const code = scan(lines.join('\n')).code;

  if (name === undefined || bindsTheName(code, name)) {
    return false;
  }

  const word = new RegExp(`(?<![\\w$])${name.replaceAll('$', '\\$')}(?![\\w$])`, 'g');

  return [...code.matchAll(word)].some(({ index }) => {
    const before = code.slice(0, index).trimEnd();
    const member = before.endsWith('.') && !before.endsWith('...');

    return !member && !declaresAMember(code, index, name);
  });
}
