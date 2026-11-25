import { CONFIG_FILE } from '../../config';
import type { ProjectRule } from '../model/rule';
import { lineOfSequence } from '../support/line-of-sequence';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

export const configRuleOffEverywhere: ProjectRule = {
  id: 'config/rule-off-everywhere',
  description:
    'A rule turned off is turned off for the files it is meant for: "off" alone silences it in every file of the project, the ones nobody thought of included.',
  severity: 'warn',
  doc: {
    why: 'An exception is decided for some files: generated mappers, a legacy module, a migration script. Written as "off" alone, it silences the rule in every file of the project, and the real findings in the others go unseen; the decision record says why the rule is off, not that the exception grew to the whole project. A rule set for some files keeps judging the rest. When the whole project is really meant, "files": ["**"] says it in so many words.',
    bad: `"rules": { "clean/function-size": "off" },
"deviations": [{ "what": "rules.clean/function-size", "adr": "0004", "reason": "The generated mappers of the legacy ledger are long." }]`,
    good: `"rules": { "clean/function-size": { "severity": "off", "files": ["src/contexts/ledger/infrastructure/legacy/*.mapper.ts"] } },
"deviations": [{ "what": "rules.clean/function-size", "adr": "0004", "reason": "The generated mappers of the legacy ledger are long." }]`,
  },
  scope: 'project',
  judge(project) {
    const { config, configText } = project;

    const findings = Object.entries(config.rules)
      .filter(([, setting]) => setting === 'off')
      .map(([id]) => ({
        line: lineOfSequence(configText, ['"rules"', `"${id}":`]),
        message: `The rule "${id}" is off for the whole project: no file is judged by it, not only the ones its exception is about.`,
        fix: `Turn it off for the files it is meant for, \`"${id}": { "severity": "off", "files": ["<glob>"] }\`; when the whole project is meant, say so with \`"files": ["**"]\`.`,
      }));

    return toViolations(reporter(project, this.id), CONFIG_FILE, findings);
  },
};
