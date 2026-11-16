import { cli, read, write } from '../helpers';
import { expectOk } from './expect-ok';
import { twoSides } from './two-sides';

/** The module of billing, which a project wired by hand registers its handlers and its routes in. */
export const BILLING_MODULE = 'src/contexts/billing/billing.module.ts';

/** The tables file of billing on Drizzle. */
export const BILLING_TABLES = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';

const TERMS = ['Order', 'Invoice', 'Refund', 'Place', 'Issue', 'Send', 'Void'].flatMap((term) => [
  '--term',
  `${term}=What billing means by it`,
]);

/** A public command of billing on one of its aggregates, as the generator wires it. */
export function command(root: string, name: string, aggregate: string): void {
  expectOk(cli(root, 'generate', 'command', 'billing', name, '--public', '--aggregate', aggregate));
}

/** Writes a file of the project again, changed. */
export function edit(root: string, file: string, change: (text: string) => string): void {
  const before = read(root, file);
  const after = change(before);

  if (after === before) {
    throw new Error(`The edit of ${file} changed nothing.`);
  }

  write(root, file, after);
}

/** The lines of a region of a file of the project, its markers left out. */
export function regionLines(root: string, file: string, region: string): string[] {
  const lines = read(root, file).split('\n');
  const open = lines.findIndex((line) => line.trim() === `// ddd-ts-kit:${region}`);
  const close = lines.findIndex((line) => line.trim() === `// /ddd-ts-kit:${region}`);

  return lines.slice(open + 1, close);
}

/** What each side of a merge does to a project wired by hand, since their base. */
interface Sides {
  readonly branch: (root: string) => void;
  readonly trunk: (root: string) => void;
}

/**
 * A project on Drizzle wired by hand whose billing stores Order, Invoice and Refund and wires the
 * commands PlaceOrder and IssueInvoice, its glossary holding every term the sides use; the branch
 * and the trunk each changed it since, the branch checked out.
 */
export function billingWiredByHand({ branch, trunk }: Sides): string {
  return twoSides({
    orm: 'drizzle',
    flags: ['--di', 'manual'],
    base: (root) => {
      ['Order', 'Invoice', 'Refund'].forEach((aggregate, at) => {
        expectOk(cli(root, 'generate', 'aggregate', 'billing', aggregate, ...(at === 0 ? TERMS : [])));
        expectOk(cli(root, 'generate', 'repository', 'billing', aggregate));
      });

      command(root, 'PlaceOrder', 'Order');
      command(root, 'IssueInvoice', 'Invoice');
    },
    branch,
    trunk,
  });
}
