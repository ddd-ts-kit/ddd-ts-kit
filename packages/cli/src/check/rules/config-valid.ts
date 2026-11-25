import { KNOWN_RULE_IDS } from '../catalogue/known-rule-ids';
import { ConfigInspection } from '../configuration/config-inspection';
import type { Rule } from '../model/rule';
import { reporter } from '../support/reporter';
import { rawConfig } from '../configuration/raw-config';
import { unknownKeys } from '../configuration/unknown-keys';

export const configValid: Rule = {
  id: 'config/valid',
  description:
    'ddd-ts-kit.config.json is consistent: no key the kit does not read, known contexts, classifications, relationships, rule ids, guard mode, agent profile and import extension, directories inside the project, the same contexts as on disk, a function limit within the ceiling, complete onePerFile.allow entries, positive commit limits, coverage thresholds that are percentages, known extra pipeline jobs and contract documents that name what they hold.',
  severity: 'error',
  doc: {
    why: 'Every other rule reads the config: a misspelled upstream or rule id silently disables a check. The contexts on disk and in the config have to be the same set, or part of the code is not checked at all. A function limit above the ceiling of 100 lines and an allowance without a file or a reason are read as something else than what is written, so they are reported too.',
    bad: `"rules": { "naming/sufix": "warn" }, "guard": "strict",
"limits": { "maxFunctionLines": 250 },
"onePerFile": { "allow": [{ "file": "src/platform/http-server.ts" }] }`,
    good: `"rules": { "naming/suffix": "warn" }, "guard": "advise",   // enforce (default), advise or off: how the editor hook reacts
"limits": { "maxFunctionLines": 40 },                       // at most 100
"onePerFile": { "allow": [{ "file": "src/platform/http-server.ts", "reason": "The server and its two error mappers are one boundary." }] }`,
  },
  scope: 'project',
  run(project) {
    const report = reporter(project, this.id);
    const inspection = new ConfigInspection(project, report);

    return [
      ...unknownKeys(rawConfig(project), project.configText, report),
      ...Object.entries(project.config.contexts).flatMap(([name, context]) =>
        inspection.declaredContext(name, context),
      ),
      ...inspection.undeclaredDirectories(),
      ...inspection.ruleSettings(KNOWN_RULE_IDS),
      ...inspection.guardMode(),
      ...inspection.worktreeMode(),
      ...inspection.agentProfile(),
      ...inspection.projectDirectories(),
      ...inspection.importExtension(),
      ...inspection.functionLinesLimit(),
      ...inspection.onePerFileAllowances(),
      ...inspection.commitLimits(),
      ...inspection.measureSettings(),
      ...inspection.ciExtras(),
      ...inspection.openApiSettings(),
      ...inspection.sdkSettings(),
    ];
  },
};
