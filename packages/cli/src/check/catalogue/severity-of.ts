import { type Config, isOneOf, projectSeverity, SEVERITIES, type Severity } from '../../config';

/** The severity of a rule for a whole project: what its config sets, or else what the rule states for itself. */
export function severityOf(
  rule: { readonly id: string; readonly severity: Severity },
  rules: Config['rules'],
): Severity {
  const configured = projectSeverity(rules[rule.id]);

  return isOneOf(SEVERITIES, configured) ? configured : rule.severity;
}
