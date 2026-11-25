import { tenantReachOf, tenantScopeOf, type ExecutionScope } from '@ddd-ts-kit/kernel';

/** The tenant an entry of a fake repository belongs to; none in a repository confined to no tenant. */
export type Owner = string | undefined;

/** Who a fake repository works for: the owner its writes are made for, and the owners its reads may see. */
export interface Confinement {
  /** The owner of what the work in progress writes. */
  writer(): Owner;
  /** Whether the work in progress may read what an owner wrote, decided once per read. */
  reader(): (owner: Owner) => boolean;
}

/** A repository of no tenant: one owner, who reads everything. */
export const UNCONFINED: Confinement = { writer: () => undefined, reader: () => () => true };

/**
 * As the tenant helpers of the ORM packages confine a statement: a write is made for the one
 * tenant of the work in progress, a read sees that tenant or the tenants of an elevation, and
 * work that names no tenant is refused (`NoCurrentTenantError`), on an empty repository too.
 */
export function confinedTo(scope: ExecutionScope): Confinement {
  return {
    writer: () => tenantScopeOf(scope).tenantId,
    reader: () => {
      const reach = tenantReachOf(scope);

      if (reach.kind === 'tenant') {
        return (owner) => owner === reach.tenantId;
      }

      const { tenants } = reach;

      return (owner) => tenants === 'all' || (owner !== undefined && tenants.includes(owner));
    },
  };
}
