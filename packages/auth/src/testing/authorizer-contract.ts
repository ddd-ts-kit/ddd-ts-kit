import { anonymousActor } from '@ddd-ts-kit/kernel';
import { ContractSuite, type Awaitable, type ContractRunner } from '@ddd-ts-kit/testing/contracts';
import type { AccessScope } from '../authorization/access-scope';
import type { Authorizer } from '../authorization/authorizer';
import type { CheckRequest } from '../authorization/check-request';
import type { Decision } from '../authorization/decision';
import type { Permission } from '../permissions/permission';
import { TenantBoundAuthorizer } from '../tenancy/tenant-bound-authorizer';

export interface AuthorizerFixture {
  readonly authorizer: Authorizer;
  /** A request the authorizer was set up to allow, by a specific grant rather than a wildcard. */
  readonly granted: CheckRequest;
  /** A request about the same kind of thing that it was set up to refuse. */
  readonly refused: CheckRequest;
}

export interface AuthorizerContractOptions {
  readonly name: string;
  /** A fresh authorizer with its two requests; called before each test. */
  createAuthorizer(): Awaitable<AuthorizerFixture>;
}

/** What every authorization model guarantees to the middleware and the handlers. */
export function authorizerContract(runner: ContractRunner, options: AuthorizerContractOptions): void {
  new AuthorizerSuite(runner, () => options.createAuthorizer()).describe(`${options.name} (authorizer contract)`);
}

const NEVER_GRANTED: Permission = {
  id: 'contract:never.granted',
  context: 'contract',
  name: 'never.granted',
  description: 'A permission no fixture grants',
};

const REASON_CODE = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

/** A tenant no fixture gives its actors. */
const TENANT_OF_NOBODY = 'contract-tenant-of-nobody';

class AuthorizerSuite extends ContractSuite<AuthorizerFixture> {
  protected tests(): void {
    this.allowsWhatWasGranted();
    this.refusesWithAStableReason();
    this.deniesByDefault();
    this.listsWhatItAllows();
    this.staysInTheTenantsOfTheActor();
    this.explainsWhatItDecides();
  }

  private allowsWhatWasGranted(): void {
    this.it('allows what was granted, each time it is asked', async () => {
      const { authorizer, granted } = this.subject;

      this.expect(await authorizer.check(granted)).toEqual({ allowed: true });
      this.expect(await authorizer.check(granted)).toEqual({ allowed: true });
    });
  }

  private refusesWithAStableReason(): void {
    this.it('refuses what was not granted with a machine code, the same each time', async () => {
      const { authorizer, refused } = this.subject;

      const first = await authorizer.check(refused);
      const second = await authorizer.check(refused);

      this.expect(first.allowed).toBe(false);
      this.expect(REASON_CODE.test(reasonOf(first))).toBe(true);
      this.expect(second).toEqual(first);
    });

    this.it('never quotes the actor or the resource in the reason', async () => {
      const { authorizer, refused } = this.subject;

      const reason = reasonOf(await authorizer.check(refused));

      this.expect(reason.includes(refused.actor.id)).toBe(false);
      this.expect(refused.resource !== undefined && reason.includes(refused.resource.id)).toBe(false);
    });
  }

  private deniesByDefault(): void {
    this.it('refuses the anonymous actor, even what somebody else was granted', async () => {
      const { authorizer, granted } = this.subject;

      const decision = await authorizer.check({ ...granted, actor: anonymousActor() });

      this.expect(decision.allowed).toBe(false);
    });

    this.it('refuses a permission nobody was granted', async () => {
      const { authorizer, granted } = this.subject;

      const decision = await authorizer.check({ ...granted, permission: NEVER_GRANTED });

      this.expect(decision.allowed).toBe(false);
    });

    this.it('leaves the request as it was', async () => {
      const { authorizer, granted } = this.subject;
      const before = structuredClone(granted);

      await authorizer.check(granted);

      this.expect(granted).toEqual(before);
    });
  }

  private listsWhatItAllows(): void {
    this.it('lists nothing for the anonymous actor', async () => {
      const { granted } = this.subject;

      const scope = await this.scopeOf({ ...granted, actor: anonymousActor() });

      this.expect(scope === undefined || covers(scope, granted.resource?.id ?? 'any') === 'no').toBe(true);
    });

    this.it('lists what a check allows and not what it refuses', async () => {
      const { granted, refused } = this.subject;

      const allowed = await this.scopeOf(granted);
      const denied = await this.scopeOf(refused);

      this.expect(allowed === undefined || covers(allowed, granted.resource?.id) !== 'no').toBe(true);
      this.expect(denied === undefined || covers(denied, refused.resource?.id) !== 'yes').toBe(true);
    });
  }

  private staysInTheTenantsOfTheActor(): void {
    this.it('bound to the tenants of the actor, refuses in the tenant of somebody else what it allows', async () => {
      const { authorizer, granted } = this.subject;
      const bound = new TenantBoundAuthorizer({ model: authorizer });

      const elsewhere = (tenantId: unknown): CheckRequest => ({
        ...granted,
        context: { ...granted.context, tenantId },
      });

      this.expect(await bound.check(granted)).toEqual({ allowed: true });

      for (const tenantId of [TENANT_OF_NOBODY, [TENANT_OF_NOBODY], '*']) {
        this.expect((await bound.check(elsewhere(tenantId))).allowed).toBe(false);
      }
    });

    this.it('bound to the tenants of the actor, never lists everything', async () => {
      const { authorizer, granted } = this.subject;
      const resourceType = granted.resource?.type;

      if (authorizer.listAccessible === undefined || resourceType === undefined) {
        return;
      }

      const bound = new TenantBoundAuthorizer({ model: authorizer });
      const { actor, permission } = granted;
      const inItsTenant = await bound.listAccessible({ actor, permission, resourceType });
      const elsewhere = await bound.listAccessible({ actor, permission, resourceType, workTenantId: TENANT_OF_NOBODY });

      this.expect(inItsTenant.kind === 'all').toBe(false);
      this.expect(elsewhere).toEqual({ kind: 'none' });
    });
  }

  private explainsWhatItDecides(): void {
    this.it('explains the decision it takes, when it explains at all', async () => {
      const { authorizer, granted, refused } = this.subject;

      if (authorizer.explain === undefined) {
        return;
      }

      const allowed = await authorizer.explain(granted);
      const denied = await authorizer.explain(refused);

      this.expect(allowed.decision).toEqual(await authorizer.check(granted));
      this.expect(denied.decision).toEqual(await authorizer.check(refused));
      this.expect([...allowed.trace, ...denied.trace].every((line) => line.text !== '' && line.depth >= 0)).toBe(true);
    });
  }

  /** `undefined` when the model cannot enumerate or the request names no resource type. */
  private async scopeOf({ actor, permission, resource }: CheckRequest): Promise<AccessScope | undefined> {
    const { authorizer } = this.subject;
    const resourceType = resource?.type ?? this.subject.granted.resource?.type;

    if (resourceType === undefined) {
      return undefined;
    }

    return authorizer.listAccessible?.({ actor, permission, resourceType });
  }
}

function reasonOf(decision: Decision): string {
  return decision.allowed ? '' : decision.reason;
}

/** A filter is for the read port to apply: nothing here can tell what it covers. */
function covers(scope: AccessScope, id: string | undefined): 'yes' | 'no' | 'unknown' {
  if (scope.kind === 'all') {
    return 'yes';
  }

  if (scope.kind === 'none') {
    return 'no';
  }

  if (scope.kind === 'filter' || id === undefined) {
    return 'unknown';
  }

  return scope.ids.includes(id) ? 'yes' : 'no';
}
