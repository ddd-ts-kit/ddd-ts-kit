import { FixedExecutionScope } from '@ddd-ts-kit/kernel';
import { anExecutionContext } from './an-execution-context';

/**
 * A scope fixed on the work of a member of one tenant, `acme` unless said otherwise: what a fake
 * confined to a tenant is built on in a spec about one tenant only. A spec about several hands
 * the fake the scope of its harness, and changes tenant with `asTenant`.
 */
export function oneTenantScope(tenantId = 'acme'): FixedExecutionScope {
  const member = { id: `member-of-${tenantId}`, type: 'user' as const, tenantId, roles: [], attributes: {} };

  return new FixedExecutionScope(anExecutionContext().as(member).ofTenant(tenantId).correlatedBy('one-tenant').build());
}
