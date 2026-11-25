import type { TenantOf } from './tenant-of';

export interface TenancyOptions {
  /** The tenant a request targets. Default `tenantOfContext`: the `tenantId` of its context. */
  readonly tenantOf?: TenantOf;
  /**
   * Roles that act across tenants, such as a platform operator, read from the roles of the actor
   * as its credential states them. A system actor carries none: it acts in the tenant of its work.
   */
  readonly crossTenantRoles?: readonly string[];
  /**
   * Who keeps the rows of a list to one tenant. `read-port` (default): the read port, from the
   * `filter { tenantId }` the scope then carries. `stores`: the stores, which confine every
   * statement to the tenant of the work (the tenant helpers of the ORM packages); the scope of
   * the model is then left as it is, and emptied for an actor that does not belong to that tenant.
   */
  readonly rowsConfinedBy?: 'read-port' | 'stores';
}
