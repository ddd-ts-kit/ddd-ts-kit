import { CliError } from '../../cli-error';
import { RULES } from '../catalogue/rules';
import type { RuleDoc } from '../model/rule-doc';

export interface DocumentedRule extends RuleDoc {
  readonly id: string;
  readonly description: string;
}

/** The description and the documentation of a rule this checker judges; an id no rule carries is a bug of the kit. */
export function documentedRule(id: string): DocumentedRule {
  const rule = RULES.find((candidate) => candidate.id === id);

  if (rule === undefined) {
    throw new CliError(`The rule "${id}" has no explanation.`, 'Report this as a bug of ddd-ts-kit.');
  }

  return { id, description: rule.description, ...rule.doc };
}
