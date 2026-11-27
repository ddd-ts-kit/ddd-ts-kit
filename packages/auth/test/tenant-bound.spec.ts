import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, systemActor, type Actor } from '@ddd-ts-kit/kernel';
import {
  ListingNotSupportedError,
  PolicyBasedAuthorizer,
  RoleBasedAuthorizer,
  SignedInGrantsAuthorizer,
  TenantBoundAuthorizer,
  permit,
  traceText,
  type AccessScope,
  type Authorizer,
  type Decision,
} from '../src';
import { AllowAll, authorizerContract } from '../src/testing';
import { ada, billingPermissions, bob, root } from './support/billing';
import { authorizerWith, docsPermissions, document, fact, user } from './support/documents';

const issue = billingPermissions['invoice.issue'];
const read = billingPermissions['invoice.read'];

const roles = {
  admin: ['*'],
  accountant: [issue, 'billing:invoice.read'],
  'billing-lead': ['billing:*'],
  clerk: [read],
};

authorizerContract(
  { describe, it, expect, beforeEach },
  {
    name: 'TenantBoundAuthorizer around roles',
    createAuthorizer: () => ({
      authorizer: new TenantBoundAuthorizer({ model: new RoleBasedAuthorizer({ roles }) }),
      granted: {
        actor: ada,
        permission: issue,
        resource: { type: 'invoice', id: 'inv-1' },
        context: { tenantId: 'acme' },
      },
      refused: {
        actor: ada,
        permission: issue,
        resource: { type: 'invoice', id: 'inv-1' },
        context: { tenantId: 'globex' },
      },
    }),
  },
);

describe('TenantBoundAuthorizer', () => {
  const authorizer = new TenantBoundAuthorizer({
    model: new RoleBasedAuthorizer({ roles: { ...roles, operator: ['*'] } }),
    crossTenantRoles: ['operator'],
  });

  const operator: Actor = { id: 'ops', type: 'user', roles: ['operator'], attributes: {} };

  const about = (actor: Actor, tenantId?: string) =>
    authorizer.check({ actor, permission: read, ...(tenantId === undefined ? {} : { context: { tenantId } }) });

  it('refuses a request that targets another tenant than the actor', async () => {
    expect(await about(ada, 'acme')).toEqual({ allowed: true });
    expect(await about(ada, 'globex')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('refuses an actor without tenant on a request that targets one', async () => {
    expect(await about(root, 'acme')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('lets a request that targets no tenant through', async () => {
    expect(await about(ada)).toEqual({ allowed: true });
  });

  it('refuses a request whose tenant is not a text, as one that targets a tenant of nobody', async () => {
    const targeting = (tenantId: unknown) => authorizer.check({ actor: ada, permission: read, context: { tenantId } });

    for (const tenantId of [42, null, ['acme'], { value: 'acme' }, '']) {
      expect(await targeting(tenantId)).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    }

    expect(await targeting(undefined)).toEqual({ allowed: true });
  });

  it('lets the roles declared cross-tenant act everywhere', async () => {
    expect(await about(operator, 'globex')).toEqual({ allowed: true });
  });

  it('leaves a refusal of the model as it is', async () => {
    expect(await authorizer.check({ actor: bob, permission: issue, context: { tenantId: 'globex' } })).toEqual({
      allowed: false,
      reason: 'NO_MATCHING_ROLE',
    });
  });

  it('scopes a list to the tenant of the actor, as a filter for the read port', async () => {
    const scope = (actor: Actor) => authorizer.listAccessible({ actor, permission: read, resourceType: 'invoice' });

    expect(await scope(ada)).toEqual({ kind: 'filter', filter: { tenantId: 'acme' } });
    expect(await scope(operator)).toEqual({ kind: 'all' });
    expect(await scope(root)).toEqual({ kind: 'none' });
  });
});

describe('TenantBoundAuthorizer, for an actor of several tenants and in the work of a tenant', () => {
  const authorizer = new TenantBoundAuthorizer({
    model: new RoleBasedAuthorizer({
      roles: { ...roles, operator: ['*'], automation: [read] },
      systemRole: 'automation',
    }),
    crossTenantRoles: ['operator'],
  });

  const consultant: Actor = { id: 'cleo', type: 'user', roles: ['clerk'], attributes: { tenants: ['acme', 'globex'] } };
  const job = systemActor('invoice-reminder');

  const about = (actor: Actor, tenantId: string, workTenantId?: string) =>
    authorizer.check({
      actor,
      permission: read,
      context: { tenantId },
      ...(workTenantId === undefined ? {} : { workTenantId }),
    });

  const scope = (actor: Actor, workTenantId?: string) =>
    authorizer.listAccessible({
      actor,
      permission: read,
      resourceType: 'invoice',
      ...(workTenantId === undefined ? {} : { workTenantId }),
    });

  it('lets an actor act in each tenant it belongs to, and in no other', async () => {
    expect(await about(consultant, 'acme')).toEqual({ allowed: true });
    expect(await about(consultant, 'globex')).toEqual({ allowed: true });
    expect(await about(consultant, 'initech')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('refuses a message that targets another tenant than the one the work runs in, even one the actor belongs to', async () => {
    expect(await about(consultant, 'globex', 'globex')).toEqual({ allowed: true });
    expect(await about(consultant, 'acme', 'globex')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(await about(ada, 'acme', 'globex')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('refuses a target that cannot be a tenant id, whatever the credential lists', async () => {
    const forged: Actor = { ...consultant, attributes: { tenants: ['*', 'acme,globex'] } };

    expect(await about(forged, '*')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(await about(forged, 'acme,globex')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('lets the system act in the tenant its work runs in, and nowhere outside of one', async () => {
    expect(await about(job, 'acme', 'acme')).toEqual({ allowed: true });
    expect(await about(job, 'globex', 'acme')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(await about(job, 'acme')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });

  it('keeps the cross-tenant roles above the tenant of the work', async () => {
    const operator: Actor = { id: 'ops', type: 'user', roles: ['operator'], attributes: {} };

    expect(await about(operator, 'globex', 'acme')).toEqual({ allowed: true });
  });

  it('scopes a list to the tenant of the work the actor belongs to', async () => {
    expect(await scope(consultant, 'globex')).toEqual({ kind: 'filter', filter: { tenantId: 'globex' } });
    expect(await scope(ada, 'acme')).toEqual({ kind: 'filter', filter: { tenantId: 'acme' } });
    expect(await scope(ada, 'globex')).toEqual({ kind: 'none' });
    expect(await scope(job, 'acme')).toEqual({ kind: 'filter', filter: { tenantId: 'acme' } });
  });

  it('outside of a tenant work, scopes a list to the one tenant of the actor, and to nothing for several', async () => {
    expect(await scope(ada)).toEqual({ kind: 'filter', filter: { tenantId: 'acme' } });
    expect(await scope(consultant)).toEqual({ kind: 'none' });
    expect(await scope(job)).toEqual({ kind: 'none' });
  });
});

const listing = (authorizer: Authorizer, actor: Actor, workTenantId?: string) =>
  authorizer.listAccessible?.({
    actor,
    permission: read,
    resourceType: 'invoice',
    ...(workTenantId === undefined ? {} : { workTenantId }),
  });

/** A model that lists what it is told to. */
class Listing extends AllowAll {
  constructor(private readonly scope: AccessScope) {
    super();
  }

  override async listAccessible(): Promise<AccessScope> {
    return this.scope;
  }
}

describe('TenantBoundAuthorizer, whatever the model', () => {
  it('holds what stands in front of the model to the tenants of the actor too', async () => {
    const signedIn = new SignedInGrantsAuthorizer({ grants: [read], otherwise: new RoleBasedAuthorizer({ roles }) });
    const bound = new TenantBoundAuthorizer({ model: signedIn });
    const about = (tenantId: string) => bound.check({ actor: bob, permission: read, context: { tenantId } });

    expect(await about('acme')).toEqual({ allowed: true });
    expect(await about('globex')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(await listing(bound, bob)).toEqual({ kind: 'filter', filter: { tenantId: 'acme' } });

    expect(
      traceText((await bound.explain({ actor: bob, permission: read, context: { tenantId: 'globex' } })).trace),
    ).toBe(
      [
        '  every signed-in person holds billing:invoice.read',
        'x the actor does not belong to globex, the tenant the request targets',
      ].join('\n'),
    );
  });

  it('holds attribute policies to the tenants of the actor, and lists no more than they do', async () => {
    const policies = new PolicyBasedAuthorizer({
      policies: [permit('invoice.anybody-reads', [read])],
      clock: new FixedClock(new Date('2026-05-04T09:00:00.000Z')),
    });

    const bound = new TenantBoundAuthorizer({ model: policies });

    expect(await bound.check({ actor: ada, permission: read, context: { tenantId: 'acme' } })).toEqual({
      allowed: true,
    });

    expect(await bound.check({ actor: ada, permission: read, context: { tenantId: 'globex' } })).toEqual({
      allowed: false,
      reason: 'TENANT_MISMATCH',
    });

    await expect(listing(bound, ada)).rejects.toThrow(ListingNotSupportedError);
  });

  it('holds relationships to the tenants of the actor, and keeps the identifiers they list', async () => {
    const edit = docsPermissions['document.edit'];
    const relationships = await authorizerWith([fact('document:1', 'editor', 'user:ada')]);
    const bound = new TenantBoundAuthorizer({ model: relationships });

    const about = (tenantId: string) => ({
      actor: ada,
      permission: edit,
      resource: document('1'),
      context: { tenantId },
    });

    const documents = (actor: Actor) => bound.listAccessible({ actor, permission: edit, resourceType: 'document' });

    expect(await bound.check(about('acme'))).toEqual({ allowed: true });
    expect(await bound.check(about('globex'))).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(await documents(ada)).toEqual({ kind: 'ids', ids: ['1'] });
    expect(await documents(user('ada'))).toEqual({ kind: 'none' });
  });

  it('explains a model that does not explain itself by the tenant alone', async () => {
    const bound = new TenantBoundAuthorizer({ model: new AllowAll() });
    const { decision, trace } = await bound.explain({ actor: ada, permission: read, context: { tenantId: 'globex' } });

    expect(decision).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
    expect(traceText(trace)).toBe('x the actor does not belong to globex, the tenant the request targets');
  });

  it('asks the tenant of a request where the project says, at once or later', async () => {
    const bound = new TenantBoundAuthorizer({
      model: new AllowAll(),
      tenantOf: ({ resource }) => Promise.resolve(resource?.id.split('/')[0]),
    });

    const about = (id: string): Promise<Decision> =>
      bound.check({ actor: ada, permission: read, resource: { type: 'invoice', id } });

    expect(await about('acme/inv-1')).toEqual({ allowed: true });
    expect(await about('globex/inv-1')).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });
});

describe('TenantBoundAuthorizer, whatever the model lists', () => {
  it('adds the tenant to the filter of the model, and lists nothing when the model names another one', async () => {
    const boundTo = (scope: AccessScope) => new TenantBoundAuthorizer({ model: new Listing(scope) });

    expect(await listing(boundTo({ kind: 'filter', filter: { region: 'eu' } }), ada)).toEqual({
      kind: 'filter',
      filter: { region: 'eu', tenantId: 'acme' },
    });

    expect(await listing(boundTo({ kind: 'filter', filter: { tenantId: 'acme' } }), ada)).toEqual({
      kind: 'filter',
      filter: { tenantId: 'acme' },
    });

    expect(await listing(boundTo({ kind: 'filter', filter: { tenantId: 'globex' } }), ada)).toEqual({ kind: 'none' });
    expect(await listing(boundTo({ kind: 'none' }), ada)).toEqual({ kind: 'none' });
  });

  it('leaves the scope of the model as it is when the stores confine the rows, but for an actor of another tenant', async () => {
    const bound = new TenantBoundAuthorizer({ model: new AllowAll(), rowsConfinedBy: 'stores' });
    const job = systemActor('invoice-reminder');

    expect(await listing(bound, ada, 'acme')).toEqual({ kind: 'all' });
    expect(await listing(bound, job, 'acme')).toEqual({ kind: 'all' });
    expect(await listing(bound, ada)).toEqual({ kind: 'all' });
    expect(await listing(bound, root)).toEqual({ kind: 'all' });
    expect(await listing(bound, ada, 'globex')).toEqual({ kind: 'none' });

    expect(await bound.check({ actor: ada, permission: read, context: { tenantId: 'globex' } })).toEqual({
      allowed: false,
      reason: 'TENANT_MISMATCH',
    });
  });

  it('reads a role that acts across tenants from the roles of the actor: a system actor holds none', async () => {
    const bound = new TenantBoundAuthorizer({ model: new AllowAll(), crossTenantRoles: ['operator'] });
    const operator: Actor = { ...root, roles: ['operator'] };
    const job = systemActor('invoice-reminder');
    const about = (actor: Actor) => bound.check({ actor, permission: read, context: { tenantId: 'globex' } });

    expect(await about(operator)).toEqual({ allowed: true });
    expect(await listing(bound, operator, 'globex')).toEqual({ kind: 'all' });
    expect(await about(job)).toEqual({ allowed: false, reason: 'TENANT_MISMATCH' });
  });
});
