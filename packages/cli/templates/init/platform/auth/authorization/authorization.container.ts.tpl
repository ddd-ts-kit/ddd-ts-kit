{{#if tenancy.any}}
import { TenantBoundAuthorizer, type Authorizer{{#if http.any}}, type Authenticator{{/if}}, type OnDecision } from '@ddd-ts-kit/auth';
{{/if}}
{{#unless tenancy.any}}
{{#if http.any}}
import type { Authenticator, OnDecision } from '@ddd-ts-kit/auth';
{{/if}}
{{#unless http.any}}
import type { OnDecision } from '@ddd-ts-kit/auth';
{{/unless}}
{{/unless}}
import { authorizationModule } from '@ddd-ts-kit/auth/di';
import type { ContextModule } from '@ddd-ts-kit/di';
import { accessPolicies } from '{{alias.platform}}/auth/authorization/access-policies{{alias.ext}}';
import { createAuthorizer } from '{{alias.platform}}/auth/authorization/create-authorizer{{alias.ext}}';

/**
 * Binds `Authorizer`, the guard both buses ask before any handler, the `Access` of the policies{{#if http.any}} and
 * the `Authenticator` of the HTTP boundary{{/if}}; `onDecision` is told every decision, allowed or refused.
 */
{{#if http.any}}
export function authorization(onDecision: OnDecision, authenticator: Authenticator): ContextModule {
  return authorizationModule({ authorizer: {{#if tenancy.any}}tenantBound(){{/if}}{{#unless tenancy.any}}createAuthorizer(){{/unless}}, authenticator, policies: accessPolicies, onDecision });
}
{{/if}}
{{#unless http.any}}
export function authorization(onDecision: OnDecision): ContextModule {
  return authorizationModule({ authorizer: {{#if tenancy.any}}tenantBound(){{/if}}{{#unless tenancy.any}}createAuthorizer(){{/unless}}, policies: accessPolicies, onDecision });
}
{{/unless}}
{{#if tenancy.any}}

/**
 * The model of create-authorizer.ts, and whatever stands in front of it, held to the tenants of
 * the actor: a request that targets a tenant (`context: { tenantId }` of its requirement) is
 * refused to who does not belong to it, and a list to who does not belong to the tenant of the
 * work. The repositories keep the rows to that tenant, so the scope of the model stays as it is.
 */
function tenantBound(): Authorizer {
  return new TenantBoundAuthorizer({ model: createAuthorizer(), rowsConfinedBy: 'stores' });
}
{{/if}}
