import type { Rule } from '../model/rule';
import { findSuppressions } from '../suppressions/find-suppressions';
import { perFile } from '../support/per-file';

const FIX =
  'Remove the comment and fix the violation; a deliberate exception is written `// ddd-ts-kit-disable-next-line <rule-id> -- ADR-NNNN: <why>` and recorded in docs/adr/.';

/** The form of a directive; governance/recorded-deviation holds the decision record behind its reason. */
export const configSuppressionNeedsReason: Rule = {
  id: 'config/suppression-needs-reason',
  description: 'An inline suppression names its rule, or its rules after commas, and gives a reason after `--`.',
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) =>
      findSuppressions(file)
        .filter(({ ruleIds, reason }) => ruleIds.length === 0 || reason === '')
        .map(({ line, ruleIds }) => ({
          line,
          message:
            ruleIds.length === 0
              ? 'A suppression names no rule.'
              : `The suppression of ${ruleIds.map((id) => `"${id}"`).join(', ')} gives no reason.`,
          fix: FIX,
        })),
    );
  },
};
