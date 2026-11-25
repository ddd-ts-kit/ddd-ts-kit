import { describe, expect, it, beforeEach } from 'vitest';
import { anonymousActor, systemActor, type Actor } from '@ddd-ts-kit/kernel';
import { AuthorizationSetupError, RoleBasedAuthorizer, type Permission } from '../src';
import { authorizerContract } from '../src/testing';
import { ada, billingPermissions, bob, catalogPermissions, root } from './support/billing';

const issue = billingPermissions['invoice.issue'];
const read = billingPermissions['invoice.read'];
const voiding = billingPermissions['invoice.void'];
const editProduct = catalogPermissions['product.edit'];

const roles = {
  admin: ['*'],
  accountant: [issue, 'billing:invoice.read'],
  'billing-lead': ['billing:*'],
  clerk: [read],
};

authorizerContract(
  { describe, it, expect, beforeEach },
  {
    name: 'RoleBasedAuthorizer',
    create: () => ({
      authorizer: new RoleBasedAuthorizer({ roles }),
      granted: { actor: ada, permission: issue, resource: { type: 'invoice', id: 'inv-1' } },
      refused: { actor: bob, permission: issue, resource: { type: 'invoice', id: 'inv-1' } },
    }),
  },
);

describe('RoleBasedAuthorizer', () => {
  const authorizer = new RoleBasedAuthorizer({ roles });
  const allowed = (actor: Actor, permission: Permission = issue) => authorizer.check({ actor, permission });

  it('grants what one of the roles of the actor lists, by permission or by id', async () => {
    expect(await allowed(ada, issue)).toEqual({ allowed: true });
    expect(await allowed(ada, read)).toEqual({ allowed: true });
    expect(await allowed(ada, voiding)).toEqual({ allowed: false, reason: 'NO_MATCHING_ROLE' });
  });

  it('grants a whole context with its wildcard, and no other context', async () => {
    const lead: Actor = { ...ada, roles: ['billing-lead'] };

    expect(await allowed(lead, voiding)).toEqual({ allowed: true });
    expect(await allowed(lead, editProduct)).toEqual({ allowed: false, reason: 'NO_MATCHING_ROLE' });
  });

  it('grants everything with the global wildcard', async () => {
    expect(await allowed(root, voiding)).toEqual({ allowed: true });
    expect(await allowed(root, editProduct)).toEqual({ allowed: true });
  });

  it('ignores a role it does not know', async () => {
    expect(await allowed({ ...ada, roles: ['intern'] })).toEqual({ allowed: false, reason: 'NO_MATCHING_ROLE' });
  });

  it('refuses the anonymous actor', async () => {
    expect(await allowed(anonymousActor())).toEqual({ allowed: false, reason: 'ANONYMOUS' });
  });

  it('refuses a grant that could never match', () => {
    expect(() => new RoleBasedAuthorizer({ roles: { clerk: ['invoice.read'] } })).toThrow(AuthorizationSetupError);
    expect(() => new RoleBasedAuthorizer({ roles: { clerk: ['billing:invoice.*'] } })).toThrow('is not a grant');
  });

  it('lists everything or nothing: it decides on actions, not on elements', async () => {
    const scope = (actor: Actor, permission: Permission = read) =>
      authorizer.listAccessible({ actor, permission, resourceType: 'invoice' });

    expect(await scope(bob)).toEqual({ kind: 'all' });
    expect(await scope(bob, voiding)).toEqual({ kind: 'none' });
    expect(await scope(anonymousActor())).toEqual({ kind: 'none' });
  });
});

describe('RoleBasedAuthorizer role hierarchy', () => {
  const authorizer = new RoleBasedAuthorizer({
    roles: { clerk: [read], accountant: [issue], controller: [voiding], auditor: [] },
    inherits: { accountant: ['clerk'], controller: ['accountant'], partner: ['controller', 'auditor'] },
  });

  const allowed = async (role: string, permission: Permission = read) =>
    (await authorizer.check({ actor: { ...ada, roles: [role] }, permission })).allowed;

  it('gives a role what the roles it includes grant, at any distance', async () => {
    expect(await allowed('accountant', read)).toBe(true);
    expect(await allowed('controller', read)).toBe(true);
    expect(await allowed('controller', issue)).toBe(true);
    expect(await allowed('partner', voiding)).toBe(true);
  });

  it('does not give an included role what the including role grants', async () => {
    expect(await allowed('clerk', issue)).toBe(false);
    expect(await allowed('accountant', voiding)).toBe(false);
  });

  it('refuses a hierarchy that loops', () => {
    expect(() => new RoleBasedAuthorizer({ roles: {}, inherits: { a: ['b'], b: ['c'], c: ['a'] } })).toThrow(
      'Role hierarchy cycle: a -> b -> c -> a',
    );
  });

  it('refuses a hierarchy naming an unknown role', () => {
    expect(() => new RoleBasedAuthorizer({ roles: { clerk: [read] }, inherits: { clerk: ['ghost'] } })).toThrow(
      'Role "clerk" inherits the unknown role "ghost"',
    );
  });
});

describe('RoleBasedAuthorizer and the system actor', () => {
  const job = systemActor('invoice-reminder');

  it('refuses a system role that no role declares', () => {
    expect(() => new RoleBasedAuthorizer({ roles, systemRole: 'automation' })).toThrow(
      new AuthorizationSetupError('Role "automation" is named in the options but declared in no role.'),
    );
  });

  it('gives the system no right unless a role is named for it', async () => {
    const authorizer = new RoleBasedAuthorizer({ roles });

    expect(await authorizer.check({ actor: job, permission: read })).toEqual({
      allowed: false,
      reason: 'NO_MATCHING_ROLE',
    });
  });

  it('gives the system the role named for it', async () => {
    const authorizer = new RoleBasedAuthorizer({ roles: { ...roles, automation: [read] }, systemRole: 'automation' });

    expect(await authorizer.check({ actor: job, permission: read })).toEqual({ allowed: true });
    expect((await authorizer.check({ actor: job, permission: issue })).allowed).toBe(false);
    expect((await authorizer.check({ actor: { ...bob, roles: [] }, permission: read })).allowed).toBe(false);
  });

  it('a user whose roles name the system role does not hold what the system holds', async () => {
    const authorizer = new RoleBasedAuthorizer({ roles: { ...roles, automation: [read] }, systemRole: 'automation' });
    const impostor: Actor = { ...bob, roles: ['automation'] };

    const decision = await authorizer.check({ actor: impostor, permission: read });
    const scope = await authorizer.listAccessible({ actor: impostor, permission: read, resourceType: 'invoice' });

    expect(decision).toEqual({ allowed: false, reason: 'NO_MATCHING_ROLE' });
    expect(scope).toEqual({ kind: 'none' });
  });

  it('a user whose roles name the system role keeps what its other roles grant', async () => {
    const authorizer = new RoleBasedAuthorizer({ roles: { ...roles, automation: [issue] }, systemRole: 'automation' });
    const clerk: Actor = { ...bob, roles: ['clerk', 'automation'] };

    const reading = await authorizer.check({ actor: clerk, permission: read });
    const issuing = await authorizer.check({ actor: clerk, permission: issue });

    expect(reading).toEqual({ allowed: true });
    expect(issuing).toEqual({ allowed: false, reason: 'NO_MATCHING_ROLE' });
  });

  it('refuses a role that inherits the system role, at any distance', () => {
    const grants = { ...roles, lead: [], automation: ['*'] };

    const direct = () =>
      new RoleBasedAuthorizer({ roles: grants, inherits: { clerk: ['automation'] }, systemRole: 'automation' });

    const transitive = () =>
      new RoleBasedAuthorizer({
        roles: grants,
        inherits: { clerk: ['lead'], lead: ['automation'] },
        systemRole: 'automation',
      });

    expect(direct).toThrow(
      new AuthorizationSetupError(
        'Role "clerk" inherits "automation", the role of the system: only a system actor holds what it grants.',
      ),
    );

    expect(transitive).toThrow(AuthorizationSetupError);
    expect(transitive).toThrow(/inherits "automation", the role of the system/);
  });

  it('lets the system role inherit other roles', async () => {
    const authorizer = new RoleBasedAuthorizer({
      roles: { ...roles, automation: [] },
      inherits: { automation: ['clerk'] },
      systemRole: 'automation',
    });

    const decision = await authorizer.check({ actor: systemActor('invoice-reminder'), permission: read });

    expect(decision).toEqual({ allowed: true });
  });
});

describe('RoleBasedAuthorizer and tenants', () => {
  it.each(['tenantOf', 'crossTenantRoles'])(
    'refuses %s, which left its options: it would silently hold nobody to a tenant',
    (option) => {
      const options = { roles, [option]: [] };

      expect(() => new RoleBasedAuthorizer(options)).toThrow(
        new AuthorizationSetupError(
          `${option} is not an option of RoleBasedAuthorizer: give it to a TenantBoundAuthorizer around it, which holds any model to the tenants of the actor.`,
        ),
      );
    },
  );
});
