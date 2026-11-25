import type { Rule } from '../model/rule';
import { strykerSettings } from '../mutation/stryker-settings';
import { reporter } from '../support/reporter';

export const testMutationGoverned: Rule = {
  id: 'test/mutation-governed',
  description:
    'The mutation score cannot be gamed by configuration: the Stryker config reads what it mutates, what it leaves out and the floor from ddd-ts-kit.config.json through governedMutation, and writes no mutate, mutator, ignorers, ignoreStatic, incremental, force or thresholds by hand.',
  severity: 'error',
  doc: {
    why: 'A mutation score says how many of the changes made to the domain and the application its tests would notice, and it only says so while the measure is honest. One source holds it: the "mutation" key of ddd-ts-kit.config.json gives the floor of each layer every context must reach, the domain and the application (80 and 75 when the key is absent), and the Stryker config reads it through governedMutation of @ddd-ts-kit/testing/mutation, which also mutates the domain and application layers of every context, the texts of their refusals left out through the ignorer of the kit, since a refusal is asserted by its code and never by its text, every other string measured. Raising the floor is free; lowering it is a deviation with its decision record (governance/recorded-deviation). What this rule refuses is the quiet way around: a mutate, mutator, ignorers, ignoreStatic or thresholds written by hand in the Stryker config, or a config that does not read the kit at all. A survivor is a rule no test states: it is read as a decision, then tested or left alive and said so, never hidden by the configuration.',
    bad: `// stryker.config.mjs
export default { testRunner: 'vitest', mutate: ['src/contexts/billing/domain/**'], thresholds: { break: 10 } };`,
    good: `// stryker.config.mjs
import { governedMutation } from '@ddd-ts-kit/testing/mutation';
export default { testRunner: 'vitest', vitest: { configFile: 'vitest.mutation.config.ts' }, ...governedMutation() };
// ddd-ts-kit.config.json
"mutation": { "domain": 70 },
"deviations": [{ "what": "mutation.domain", "adr": "0013", "reason": "The legacy module is retired next quarter." }]`,
  },
  scope: 'project',
  run(project) {
    const report = reporter(project, this.id);

    return strykerSettings(project).map(({ file, line, message, fix }) => report({ file, line }, message, fix));
  },
};
