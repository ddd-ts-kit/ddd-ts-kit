import type { Decision } from './decision';

/** Whether a value is a decision: allowed, or refused with its reason code. */
export function isDecision(value: unknown): value is Decision {
  if (typeof value !== 'object' || value === null || !('allowed' in value)) {
    return false;
  }

  return value.allowed === true || (value.allowed === false && 'reason' in value && typeof value.reason === 'string');
}
