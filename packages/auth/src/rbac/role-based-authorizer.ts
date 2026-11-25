import { isAnonymous, isSystem, type Actor } from '@ddd-ts-kit/kernel';
import type { AccessScope } from '../authorization/access-scope';
import type { Authorizer } from '../authorization/authorizer';
import type { CheckRequest } from '../authorization/check-request';
import { ALLOWED, deny, type Decision } from '../authorization/decision';
import { DenialReason } from '../authorization/denial-reason';
import type { Explanation } from '../authorization/explanation';
import type { ListRequest } from '../authorization/list-request';
import { Trace } from '../authorization/trace';
import { AuthorizationSetupError } from '../errors/authorization-setup-error';
import type { Permission } from '../permissions/permission';
import { RoleGrants, type CoveringGrant, type RoleGrantsDefinition } from './role-grants';

export interface RoleBasedAuthorizerOptions extends RoleGrantsDefinition {
  /**
   * The role given to actors of type `system`, which carry none. Default: no role. Only a system
   * actor holds it: the roles of any other actor that name it are read without it, so a token
   * cannot hand a user what the system holds, and a role that inherits it, at any distance, is
   * refused at construction.
   */
  readonly systemRole?: string;
}

/**
 * RBAC: an actor may do what one of its roles grants. It decides on actions, not on elements, and
 * knows no tenant: `TenantBoundAuthorizer` holds it, like any model, to the tenants of the actor.
 */
export class RoleBasedAuthorizer implements Authorizer {
  private readonly grants: RoleGrants;

  constructor(private readonly options: RoleBasedAuthorizerOptions) {
    assertNoTenancyOption(options);
    this.grants = new RoleGrants(options);
    assertSystemRole(options, this.grants);
  }

  async check(request: CheckRequest): Promise<Decision> {
    return (await this.explain(request)).decision;
  }

  /** Why: what each role of the actor grants. */
  async explain(request: CheckRequest): Promise<Explanation> {
    const trace = new Trace();

    if (isAnonymous(request.actor)) {
      return { decision: deny(DenialReason.anonymous), trace: trace.lines };
    }

    const granted = this.someRoleGrants(request.actor, request.permission, trace);

    return { decision: granted ? ALLOWED : deny(DenialReason.noMatchingRole), trace: trace.lines };
  }

  /** Constant time: everything a role grants, or nothing. */
  async listAccessible({ actor, permission }: ListRequest): Promise<AccessScope> {
    return !isAnonymous(actor) && this.holds(actor, permission) ? { kind: 'all' } : { kind: 'none' };
  }

  /** Every role of the actor is visited, one line each, so a refusal says what each one grants. */
  private someRoleGrants(actor: Actor, permission: Permission, trace: Trace): boolean {
    const roles = this.rolesOf(actor);

    if (roles.length === 0) {
      return trace.no(
        `${permission.id} asked of no role: the ${isSystem(actor) ? 'system' : 'actor'} holds none${this.systemRoleNote(actor)}`,
      );
    }

    trace.yes(`${permission.id} asked of the roles ${roles.join(', ')}${this.systemRoleNote(actor)}`);

    let granted = false;

    for (const role of roles) {
      granted = this.roleGrants(role, permission, trace) || granted;
    }

    return granted;
  }

  private roleGrants(role: string, permission: Permission, trace: Trace): boolean {
    if (!this.grants.declares(role)) {
      return trace.no(`${role} is not a declared role`, 1);
    }

    const covering = this.grants.coveringOf(role, permission);

    if (covering === undefined) {
      const patterns = this.grants.patternsOf(role);

      return trace.no(`${role} grants ${patterns.length === 0 ? 'nothing' : patterns.join(', ')}`, 1);
    }

    return trace.yes(`${role} grants ${coveringText(covering, permission)}`, 1);
  }

  private holds(actor: Actor, permission: Permission): boolean {
    return this.rolesOf(actor).some((role) => this.grants.coveringOf(role, permission) !== undefined);
  }

  /** The system role is held by a system actor only: named among the roles of another actor, it is left out. */
  private rolesOf(actor: Actor): readonly string[] {
    const { systemRole } = this.options;

    if (systemRole === undefined) {
      return actor.roles;
    }

    const own = actor.roles.filter((role) => role !== systemRole);

    return isSystem(actor) ? [...own, systemRole] : own;
  }

  private systemRoleNote(actor: Actor): string {
    const { systemRole } = this.options;

    if (systemRole === undefined) {
      return '';
    }

    if (isSystem(actor)) {
      return ` (${systemRole} is the role of the system)`;
    }

    return actor.roles.includes(systemRole)
      ? ` (${systemRole} is the role of the system, held by a system actor only)`
      : '';
  }
}

/** `billing:*, which covers billing:invoice.void, through controller`: the pattern, what it covers when it is wider, where it comes from. */
function coveringText({ pattern, through }: CoveringGrant, permission: Permission): string {
  const covers = pattern === permission.id ? '' : `, which covers ${permission.id}`;

  return through === undefined ? `${pattern}${covers}` : `${pattern}${covers}, through ${through}`;
}

const LEFT_TO_THE_TENANT_BOUND = ['tenantOf', 'crossTenantRoles'];

/** The tenant rule left this authorizer: an option that names it would silently hold nobody to a tenant. */
function assertNoTenancyOption(options: object): void {
  const left = LEFT_TO_THE_TENANT_BOUND.find((option) => option in options);

  if (left !== undefined) {
    throw new AuthorizationSetupError(
      `${left} is not an option of RoleBasedAuthorizer: give it to a TenantBoundAuthorizer around it, which holds any model to the tenants of the actor.`,
    );
  }
}

/**
 * A system role that no role declares would silently do nothing, and a role that inherits it would
 * hand another actor what the system holds: both are refused at construction, like an unknown
 * inherited role.
 */
function assertSystemRole({ systemRole }: RoleBasedAuthorizerOptions, grants: RoleGrants): void {
  if (systemRole === undefined) {
    return;
  }

  if (!grants.declares(systemRole)) {
    throw new AuthorizationSetupError(`Role "${systemRole}" is named in the options but declared in no role.`);
  }

  const heir = grants.includersOf(systemRole)[0];

  if (heir !== undefined) {
    throw new AuthorizationSetupError(
      `Role "${heir}" inherits "${systemRole}", the role of the system: only a system actor holds what it grants.`,
    );
  }
}
