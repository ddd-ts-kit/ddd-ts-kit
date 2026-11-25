import { ignoreHints } from '../coverage/ignore-hints';
import { runnerSettings } from '../coverage/runner-settings';
import { scriptFlags } from '../coverage/script-flags';
import { recordsOf } from '../governance/records-of';
import type { FileRule } from '../model/rule';
import { reporter } from '../support/reporter';

export const testCoverageGoverned: FileRule = {
  id: 'test/coverage-governed',
  description:
    'Coverage cannot be gamed by exclusion: the test runner config reads the measured layers and their thresholds from ddd-ts-kit.config.json and writes no include, exclude or thresholds by hand, no script sets them by a flag, and no production source carries a coverage ignore comment without a decision record.',
  severity: 'error',
  doc: {
    why: 'A coverage threshold is a floor that says how much of a layer no test has ever run, and it only says so while the measure is honest. One source holds it: the "coverage" key of ddd-ts-kit.config.json gives, per layer, the four rates every context must reach (the reference when the key is absent), and the test runner config reads them through governedCoverage of @ddd-ts-kit/testing/coverage, which also measures the four layers of every context, the files no test loads included. Raising a threshold is free; lowering one is a deviation with its decision record (governance/recorded-deviation). What this rule refuses is the quiet way around: an include, an exclude or thresholds written by hand in the runner config, the same set by a flag in a script, and a coverage ignore comment (v8 ignore, istanbul ignore, c8 ignore) in a production source that names no decision record. A rate proves that code ran under a test, never that the test asserts anything: the floor is not a goal.',
    bad: `// vitest.config.ts
coverage: { ...governedCoverage(mode), exclude: ['src/contexts/billing/infrastructure/**'] }
// domain/aggregates/invoice.aggregate.ts
/* v8 ignore next 3 */`,
    good: `// vitest.config.ts
coverage: { provider: 'v8', reporter: ['text', 'cobertura', 'lcov'], ...governedCoverage(mode) }
// ddd-ts-kit.config.json
"coverage": { "infrastructure": { "branches": 50 } },
"deviations": [{ "what": "coverage.infrastructure.branches", "adr": "0011", "reason": "The driver's failure branches are held by its contract suite." }]
// domain/aggregates/invoice.aggregate.ts, under Vitest, whose v8 provider reads v8 hints only
/* v8 ignore next 3 -- ADR-0012: reached only by the legacy import, removed with it */
// the same under Jest, whose babel provider reads istanbul hints only
/* istanbul ignore next -- ADR-0012: reached only by the legacy import, removed with it */`,
  },
  scope: 'file',
  judge(file, project) {
    return ignoreHints(file, recordsOf(project));
  },
  acrossProject(project) {
    const report = reporter(project, this.id);

    return [...runnerSettings(project), ...scriptFlags(project)].map(({ file, line, message, fix }) =>
      report({ file, line }, message, fix),
    );
  },
};
