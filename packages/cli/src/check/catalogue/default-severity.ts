import { DELEGATED_RULES } from './delegated-rules';
import { RULES } from './rules';

const DEFAULTS: ReadonlyMap<string, 'error' | 'warn'> = new Map(
  [...RULES, ...DELEGATED_RULES].map((rule) => [rule.id, rule.severity]),
);

/** The severity a rule states for itself, which holds when the config says nothing; an id no rule carries blocks. */
export function defaultSeverity(ruleId: string): 'error' | 'warn' {
  return DEFAULTS.get(ruleId) ?? 'error';
}
