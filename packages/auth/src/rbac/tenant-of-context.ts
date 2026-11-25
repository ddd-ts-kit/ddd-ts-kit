import type { CheckRequest } from '../authorization/check-request';

/**
 * For `tenantOf`: reads `context.tenantId`, which `requires(..., { context })` provides. Absent,
 * the request targets no tenant; anything else is handed as it came, for the check to refuse
 * what is not a tenant id.
 */
export function tenantOfContext(request: CheckRequest): unknown {
  return request.context?.['tenantId'];
}
