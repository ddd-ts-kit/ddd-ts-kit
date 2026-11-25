import type { Rule } from '../model/rule';
import { configSuppressionNeedsReason } from '../rules/config-suppression-needs-reason';
import { configUnusedSuppression } from '../rules/config-unused-suppression';
import { configValid } from '../rules/config-valid';
import { ARCHITECTURE_RULES } from './architecture-rules';

/** The rules this checker runs: the last three name the ids of the others, which is why they stand apart. */
export const RULES: readonly Rule[] = [
  ...ARCHITECTURE_RULES,
  configValid,
  configSuppressionNeedsReason,
  configUnusedSuppression,
];
