import { ARCHITECTURE_RULES } from './architecture-rules';

/** The ids this checker runs, in the order `ddd-ts-kit rules` lists them. */
export const RULE_IDS: readonly string[] = [
  ...ARCHITECTURE_RULES.map((rule) => rule.id),
  'config/valid',
  'config/suppression-needs-reason',
  'config/unused-suppression',
];
