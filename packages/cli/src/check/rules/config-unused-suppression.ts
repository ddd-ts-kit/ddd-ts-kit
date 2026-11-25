import { ESLINT_JUDGED_RULES } from '../catalogue/eslint-judged-rules';
import { KNOWN_RULE_IDS } from '../catalogue/known-rule-ids';
import { RULE_IDS } from '../catalogue/rule-ids';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import { findSuppressions } from '../suppressions/find-suppressions';
import type { IdleSuppression } from '../suppressions/idle-suppression';
import { perFile } from '../support/per-file';
import { reporter } from '../support/reporter';

const UNKNOWN_FIX =
  'Name the rule as its finding prints it (`ddd-ts-kit rules` lists the ids), or remove the comment when what it excused is gone.';

const IDLE_FIX =
  'Remove the comment, or the id from its list: a suppression lives as long as the finding it excuses. When the finding moved, put the comment on the line above it.';

export const configUnusedSuppression: Rule = {
  id: 'config/unused-suppression',
  description:
    'An inline suppression silences something: each id it names is a rule, and breaks on the line of code after it.',
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) =>
      findSuppressions(file).flatMap(({ line, ruleIds }) =>
        ruleIds
          .filter((id) => !KNOWN_RULE_IDS.includes(id))
          .map((id) => ({ line, message: `The suppression names "${id}", which is no rule.`, fix: UNKNOWN_FIX })),
      ),
    );
  },
  ofIdleSuppressions(project, idle) {
    const report = reporter(project, this.id);

    return idle
      .filter((directive) => isJudgedHere(project, directive))
      .map(({ suppression, ruleId }) =>
        report(
          suppression,
          `The suppression of "${ruleId}" silences nothing: line ${suppression.covers.at(-1)} does not break the rule.`,
          IDLE_FIX,
        ),
      );
  },
};

/**
 * Whether this checker alone decides that the rule has nothing to report on the line: it runs the
 * rule on the file, and ESLint, which reads the same directive from a syntax tree and may find what
 * a reading of the text does not, holds no rule of that id.
 */
function isJudgedHere(project: Project, { suppression, ruleId }: IdleSuppression): boolean {
  return (
    RULE_IDS.includes(ruleId) &&
    !ESLINT_JUDGED_RULES.includes(ruleId) &&
    project.severity(ruleId) !== 'off' &&
    project.fileSeverity(ruleId, suppression.file) !== 'off'
  );
}
