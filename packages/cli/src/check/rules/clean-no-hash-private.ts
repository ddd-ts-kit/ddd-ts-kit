import type { FileRule } from '../model/rule';

const HASH_MEMBER =
  /^[ \t]*(?:(?:static|readonly|async|get|set|declare|override|accessor)\s+)*\*?\s*#([A-Za-z_$][\w$]*)/gm;

export const cleanNoHashPrivate: FileRule = {
  id: 'clean/no-hash-private',
  description:
    'Class members are `private`, never `#name`: one way to hide a member, the one the compiler checks and the fakes of a test can reach.',
  severity: 'error',
  doc: {
    why: 'A code base has one way to hide a member. `private` is checked by the compiler, reads the same on a field, a method and a constructor parameter, and leaves the member reachable by the tooling of a test. `#name` is a second spelling of the same intention, with its own rules, that cannot be mixed with constructor parameters. ESLint can rewrite it when the change is safe.',
    bad: `export class InMemoryInvoiceRepository {
  readonly #rows = new Map<string, Invoice>();

  #find(id: string): Invoice | undefined {
    return this.#rows.get(id);
  }
}`,
    good: `export class InMemoryInvoiceRepository {
  private readonly rows = new Map<string, Invoice>();

  private find(id: string): Invoice | undefined {
    return this.rows.get(id);
  }
}`,
  },
  scope: 'file',
  standalone: true,
  judge(file) {
    return [...file.scan.code.matchAll(HASH_MEMBER)].map((match) => ({
      line: file.scan.lineAt(match.index + match[0].indexOf('#')),
      message: `The member #${match[1] ?? ''} is an ECMAScript private member.`,
      fix: `Declare it \`private ${match[1] ?? 'name'}\` and write \`this.${match[1] ?? 'name'}\` where it is used.`,
    }));
  },
};
