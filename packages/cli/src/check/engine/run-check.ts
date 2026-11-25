import { RULES } from '../catalogue/rules';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import type { Violation } from '../model/violation';
import { findSuppressions } from '../suppressions/find-suppressions';
import { Silencing } from '../suppressions/silencing';
import type { CheckResult } from './check-result';
import { summarize } from './summarize';

export interface CheckOptions {
  /** Run only these rule ids. */
  readonly rules?: readonly string[];
  /** Skip the rules that need the whole tree. */
  readonly fileScopeOnly?: boolean;
  /** The rules the engine judges with: the kit's, unless a spec hands its own. */
  readonly catalogue?: readonly Rule[];
}

export function runCheck(project: Project, options: CheckOptions = {}): CheckResult {
  const selected = (id: string): boolean =>
    options.rules === undefined || options.rules.length === 0 || options.rules.includes(id);

  const active = (options.catalogue ?? RULES).filter(
    (rule) => selected(rule.id) && project.severity(rule.id) !== 'off',
  );

  const raw = active
    .flatMap((rule) => violationsOf(rule, project, options.fileScopeOnly === true))
    .flatMap((violation) => placed(violation, project));

  const silencing = new Silencing(project.files.flatMap(findSuppressions));
  const kept = raw.filter((violation) => !silencing.silences(violation));
  const suppressedCount = raw.length - kept.length;

  if (judgesEverything(options)) {
    const idle = active.flatMap((rule) => rule.ofIdleSuppressions?.(project, silencing.idle) ?? []);

    kept.push(...idle.flatMap((violation) => placed(violation, project)));
  }

  kept.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));

  return summarize(kept, { suppressedCount, suppressionCount: silencing.count, fileCount: project.files.length });
}

/** Only a run of every rule on every file knows that a directive silenced nothing. */
function judgesEverything({ rules = [], fileScopeOnly = false }: CheckOptions): boolean {
  return rules.length === 0 && !fileScopeOnly;
}

/**
 * A finding on a file a setting names takes its severity, or is dropped where the rule is off. A
 * finding a rule raises above the severity of the project (the ceiling of clean/function-size) keeps it.
 */
function placed(violation: Violation, project: Project): Violation[] {
  const severity = project.fileSeverity(violation.ruleId, violation.file);

  if (severity === undefined) {
    return [violation];
  }

  if (severity === 'off') {
    return [];
  }

  return [violation.severity === project.severity(violation.ruleId) ? { ...violation, severity } : violation];
}

function violationsOf(rule: Rule, project: Project, oneFileOnly: boolean): Violation[] {
  if (!oneFileOnly) {
    return [...rule.run(project), ...(rule.acrossProject?.(project) ?? [])];
  }

  return rule.scope === 'project' ? [] : rule.run(project);
}
