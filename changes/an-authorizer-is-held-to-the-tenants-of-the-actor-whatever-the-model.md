**The tenant of a request is checked the same way for every access model, and `init` turns it on in a project with tenants.** `@ddd-ts-kit/auth` has a `TenantBoundAuthorizer` that goes around any authorizer, roles, attribute policies, relationships, OpenFGA or one of the project, and around a `SignedInGrantsAuthorizer` placed in front of it: what the model allows is refused with `TENANT_MISMATCH` when the request targets a tenant the actor does not belong to, something that is not a tenant id, or another tenant than the one the work runs in, and what the model lists is kept to one tenant (`all` becomes `filter { tenantId }`, or stays as it is under `rowsConfinedBy: 'stores'` where the repositories confine every statement to the tenant of the work). `RoleBasedAuthorizer` decides on roles alone: its options `tenantOf` and `crossTenantRoles` are gone. `init --tenancy shared-table` writes the bound authorizer around `createAuthorizer()` for the four values of `--authz`, and gives the guard of `--di manual` the execution scope, so the tenant of the work reaches the authorizer there too. `authorizerContract` of `@ddd-ts-kit/auth/testing` has two more cases, which every authorizer runs: bound to tenants, what it allows is refused in the tenant of somebody else, and it never lists everything. See the section Tenants of `packages/auth/README.md`.

The tenant of a context is refused when it is not a text: `tenantOfContext` hands `context.tenantId` as it came, and a number, a list, an object, `null` or an empty text is no tenant id. Absent, the request targets no tenant, as before.

`passportPrincipal` refuses, with an error that names the mapper, a user the strategy authenticated and for whom `actorOf` answers something that is not an actor (no `attributes`, no `roles`, nothing at all): the request fails instead of going on as nobody.

`PolicyAccess` refuses with `AuthorizationSetupError` a policy whose `allows` answers neither a boolean nor a decision, a promise included: `allows` is synchronous, and the error names the policy instead of reading as a refusal of the actor.

`passportPrincipal` and `PassportAuthenticator` refuse an empty credential with `InvalidCredentialError`, as `JwtAuthenticator` does: a credential that was presented and is not acceptable is refused, only an absent one is anonymous.

To move: replace `new RoleBasedAuthorizer({ roles, tenantOf: tenantOfContext, crossTenantRoles })` by `new TenantBoundAuthorizer({ model: new RoleBasedAuthorizer({ roles }), crossTenantRoles })`; `tenantOf` moves with it and defaults to `tenantOfContext`. A role of `crossTenantRoles` is now read from the roles of the actor as its credential states them: take the `systemRole` out of that list, a system actor acts in the tenant of its work. When a `SignedInGrantsAuthorizer` wraps the model, the bound authorizer goes around it.

To move: in a project of `init --tenancy shared-table`, wrap the authorizer where it is bound, `authorizer: new TenantBoundAuthorizer({ model: createAuthorizer(), rowsConfinedBy: 'stores' })` in `src/platform/auth/authorization/authorization.ts` (in `src/platform/composition/create-platform.ts` under `--di manual`, where `UseCaseProtection` and `PolicyAccess` also take `scope`), or run `ddd-ts-kit init --force` and keep these two files.

To move: a custom `tenantOf` is typed `(request) => unknown`; nothing to change in one that answers a text or `undefined`.

To move: make an `allows` declared `async` synchronous, and load what it awaited in the handler, before it asks `Access`.

To move: an `actorOf` given to `passportPrincipal` answers a whole actor (`id`, `type`, `roles`, `attributes`) for every user the strategy lets through.
