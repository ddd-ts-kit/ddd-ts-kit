import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { failure } from './reports';
import { initProject } from './support/init-project';

const ROLES = 'src/platform/auth/roles/roles.ts';

const IMPORTS = [
  "import type { Grant } from '@ddd-ts-kit/auth';",
  "import { billingPermissions } from '@/contexts/billing/billing.permissions';",
  "import { Role } from '@/platform/auth/authorization/role';",
].join('\n');

function projectWithRoles(...roles: readonly string[]): string {
  const root = initProject('--context', 'billing:core');

  write(
    root,
    'src/platform/auth/authorization/role.ts',
    "export const Role = { Admin: 'admin', Clerk: 'clerk' } as const;\n",
  );

  write(root, ROLES, `${IMPORTS}\n\n${roles.join('\n')}\n`);

  return root;
}

function grant(root: string, role: string) {
  return cli(
    root,
    'generate',
    'query',
    'billing',
    'GetInvoice',
    '--permission',
    'invoice.get',
    '--grant',
    role,
    '--allow-name',
    '--json',
  );
}

const GET = "billingPermissions['invoice.get']";

describe('generate --grant <role> writes in the list of the role named, or refuses', () => {
  it('refuses a role whose grants are a named list, and leaves the list of the next role as it is', () => {
    const root = projectWithRoles(
      "const EVERYTHING: readonly Grant[] = ['*'];",
      '',
      'export const roles: Readonly<Record<string, readonly Grant[]>> = {',
      '  [Role.Admin]: EVERYTHING,',
      "  [Role.Clerk]: ['billing:*'],",
      '};',
    );

    const before = read(root, ROLES);
    const refused = failure(grant(root, 'admin'));

    expect(refused.message).toBe(
      'src/platform/auth/roles/roles.ts gives the role admin its grants as `EVERYTHING`, not as a list written there.',
    );

    expect(refused.fix).toBe(`Grant ${GET} to the role admin by hand, then run the command again without --grant.`);
    expect(read(root, ROLES)).toBe(before);
  });

  it('reads the key of the role in the code, never in a comment or a string that names it', () => {
    const root = projectWithRoles(
      'export const roles: Readonly<Record<string, readonly Grant[]>> = {',
      '  // [Role.Clerk]: reads, never writes.',
      "  [Role.Admin]: ['*', '[Role.Clerk]: [see below]'],",
      "  [Role.Clerk]: ['billing:*'],",
      '};',
    );

    expect(grant(root, 'clerk').code).toBe(0);

    expect(read(root, ROLES)).toContain(
      [
        '  // [Role.Clerk]: reads, never writes.',
        "  [Role.Admin]: ['*', '[Role.Clerk]: [see below]'],",
        `  [Role.Clerk]: ['billing:*', ${GET}],`,
      ].join('\n'),
    );
  });

  it('adds to the list of a role keyed by its value, where a second entry would replace the first', () => {
    const root = projectWithRoles(
      'export const roles: Readonly<Record<string, readonly Grant[]>> = {',
      "  admin: ['*'],",
      '  "clerk": [',
      "    'billing:*' // every use case of billing",
      '  ],',
      '};',
    );

    expect(grant(root, 'admin').code).toBe(0);
    expect(grant(root, 'clerk').code).toBe(0);

    expect(read(root, ROLES)).toContain(
      [
        `  admin: ['*', ${GET}],`,
        '  "clerk": [',
        "    'billing:*', // every use case of billing",
        `    ${GET},`,
        '  ],',
      ].join('\n'),
    );
  });

  it('refuses an object of roles written on one line, where a new role has no line to take', () => {
    const root = projectWithRoles("export const roles = { [Role.Admin]: ['*'] };");
    const refused = failure(grant(root, 'clerk'));

    expect(refused.message).toBe(
      'src/platform/auth/roles/roles.ts: the object of `roles` does not close on a line of its own, so the generator cannot tell where a new entry goes.',
    );

    expect(refused.fix).toBe(`Grant ${GET} to the role clerk by hand, then run the command again without --grant.`);
  });

  it('adds a role after a last entry that carries no comma', () => {
    const root = projectWithRoles('export const roles = {', "  [Role.Admin]: ['*'] // all of it", '};');

    expect(grant(root, 'clerk').code).toBe(0);

    expect(read(root, ROLES)).toContain(
      ['export const roles = {', "  [Role.Admin]: ['*'], // all of it", `  [Role.Clerk]: [${GET}],`, '};'].join('\n'),
    );
  });
});
