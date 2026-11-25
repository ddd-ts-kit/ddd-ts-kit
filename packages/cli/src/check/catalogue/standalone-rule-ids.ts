import { RULES } from './rules';

/** The rules that judge a source on its own, whatever the project around it (`check --clean-only`). */
export const STANDALONE_RULE_IDS: readonly string[] = RULES.filter((rule) => rule.standalone === true).map(
  (rule) => rule.id,
);
