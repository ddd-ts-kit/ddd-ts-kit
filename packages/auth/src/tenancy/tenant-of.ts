import type { CheckRequest } from '../authorization/check-request';

/**
 * The tenant a request targets, or `undefined` when it targets none, at once or as a promise.
 * What is answered is not trusted to be a tenant id: the check refuses anything else. See
 * `tenantOfContext`.
 */
export type TenantOf = (request: CheckRequest) => unknown;
