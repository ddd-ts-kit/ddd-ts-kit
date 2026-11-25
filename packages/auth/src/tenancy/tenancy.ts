import { isSystem, isTenantId, isTenantMember, tenantsOf, type Actor } from '@ddd-ts-kit/kernel';
import type { AccessScope } from '../authorization/access-scope';
import type { CheckRequest } from '../authorization/check-request';
import type { ListRequest } from '../authorization/list-request';
import type { Trace } from '../authorization/trace';
import type { TenancyOptions } from './tenancy-options';
import { tenantOfContext } from './tenant-of-context';

const NOTHING: AccessScope = Object.freeze({ kind: 'none' });

/**
 * Where an actor may act: in the tenants it belongs to, and in the one the work runs in when the
 * work runs in one. A system actor belongs to the tenant of its work, and to none outside of one;
 * a role that acts across tenants settles both questions.
 */
export class Tenancy {
  constructor(private readonly options: TenancyOptions) {}

  /** Whether the request stays in a tenant the actor may act in, said in one line of the trace. */
  async admits(request: CheckRequest, trace: Trace): Promise<boolean> {
    const crossing = this.crossingRoleOf(request.actor);

    if (crossing !== undefined) {
      return trace.yes(`${crossing} acts across tenants`);
    }

    const targeted: unknown = await (this.options.tenantOf ?? tenantOfContext)(request);

    if (targeted === undefined) {
      return trace.yes('the request targets no tenant');
    }

    if (!isTenantId(targeted)) {
      return trace.no(
        typeof targeted === 'string'
          ? `"${targeted}" is not a tenant id`
          : 'the tenant the request targets is not a text',
      );
    }

    return mayActIn(targeted, request, trace);
  }

  /**
   * What the model lists, kept to one tenant: the tenant of the work when the actor belongs to
   * it, else the one tenant of an actor that has one. An actor of several tenants outside of a
   * tenant's work, and an actor of none, read nothing: a list is read in one tenant.
   */
  narrowed(scope: AccessScope, request: ListRequest): AccessScope {
    if (scope.kind === 'none' || this.crossingRoleOf(request.actor) !== undefined) {
      return scope;
    }

    if (this.options.rowsConfinedBy === 'stores') {
      return worksElsewhere(request) ? NOTHING : scope;
    }

    const tenantId = listedTenantOf(request);

    return tenantId === undefined ? NOTHING : within(tenantId, scope);
  }

  private crossingRoleOf(actor: Actor): string | undefined {
    const crossing = this.options.crossTenantRoles ?? [];

    return actor.roles.find((role) => crossing.includes(role));
  }
}

/** The tenant is the one the work runs in, when it runs in one, and the actor belongs to it. */
function mayActIn(tenantId: string, { actor, workTenantId }: CheckRequest, trace: Trace): boolean {
  if (workTenantId !== undefined && tenantId !== workTenantId) {
    return trace.no(`the request targets ${tenantId} while the work runs in ${workTenantId}`);
  }

  if (isTenantMember(actor, tenantId)) {
    return trace.yes(`the actor belongs to ${tenantId}, the tenant the request targets`);
  }

  if (isSystem(actor)) {
    return tenantId === workTenantId
      ? trace.yes(`the system acts in ${tenantId}, the tenant of its work`)
      : trace.no(`the system acts in the tenant of its work only, and this work runs in none`);
  }

  return trace.no(`the actor does not belong to ${tenantId}, the tenant the request targets`);
}

/** The work runs in a tenant the actor may not work in. */
function worksElsewhere({ actor, workTenantId }: ListRequest): boolean {
  return workTenantId !== undefined && !belongsTo(actor, workTenantId);
}

/** The one tenant a list is read in, when the actor belongs to it. */
function listedTenantOf({ actor, workTenantId }: ListRequest): string | undefined {
  if (workTenantId !== undefined) {
    return belongsTo(actor, workTenantId) ? workTenantId : undefined;
  }

  const tenants = tenantsOf(actor).filter(isTenantId);

  return tenants.length === 1 ? tenants[0] : undefined;
}

/** Whether the actor may work in the tenant of the work: a member, or a system actor, which runs the work of that tenant. */
function belongsTo(actor: Actor, workTenantId: string): boolean {
  return isTenantMember(actor, workTenantId) || isSystem(actor);
}

/** The scope as a filter on the tenant; identifiers stay as the model listed them, each one checked by it. */
function within(tenantId: string, scope: AccessScope): AccessScope {
  if (scope.kind === 'all') {
    return { kind: 'filter', filter: { tenantId } };
  }

  if (scope.kind !== 'filter') {
    return scope;
  }

  const named = scope.filter['tenantId'];

  return named === undefined || named === tenantId
    ? { kind: 'filter', filter: { ...scope.filter, tenantId } }
    : NOTHING;
}
