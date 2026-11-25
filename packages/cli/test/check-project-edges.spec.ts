import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { testRunners } from '../src/check/alias/test-runners';
import { signedInGrantSources } from '../src/check/authz/signed-in-grant-sources';
import { baselineText } from '../src/check/baseline/baseline-text';
import { parseBaseline } from '../src/check/baseline/parse-baseline';
import { DELEGATED_RULES } from '../src/check/catalogue/delegated-rules';
import { rawConfig } from '../src/check/configuration/raw-config';
import { unknownKeys } from '../src/check/configuration/unknown-keys';
import { runnerSettings } from '../src/check/coverage/runner-settings';
import { delegatedDoc } from '../src/check/explain/delegated-doc';
import { documentedRule } from '../src/check/explain/documented-rule';
import { explanationsOf } from '../src/check/explain/explanations-of';
import { DecisionRecords } from '../src/check/governance/decision-records';
import { readDrizzleMigrations } from '../src/check/migrations/read-drizzle-migrations';
import type { Project } from '../src/check/model/project';
import { strykerSettings } from '../src/check/mutation/stryker-settings';
import { assembleProject } from '../src/check/project/assemble-project';
import { runCheck } from '../src/check/engine/run-check';
import { loadLooseProject } from '../src/check/project/load-loose-project';
import { loadProject } from '../src/check/project/load-project';
import { reporter } from '../src/check/support/reporter';
import { CONFIG_FILE, parseConfig } from '../src/config';
import { tempDir, write } from './helpers';
import { projectWith } from './rules-support';

const CONFIG = parseConfig({ contexts: { billing: { classification: 'core' } } });
const NOWHERE = path.join(os.tmpdir(), `ddd-ts-kit-nowhere-${String(process.pid)}`);

/** A project whose root is not on disk: what a reader finds there is nothing. */
const nowhere = (configText = ''): Project =>
  assembleProject({ root: NOWHERE, config: CONFIG, configText, files: [], contextEntries: [], contextsOnDisk: [] });

describe('the readers of the checker, on a project whose files are not where they are expected', () => {
  it('read no runner, mutation or alias config at a root that does not exist', () => {
    const project = nowhere();

    expect(runnerSettings(project)).toEqual([]);
    expect(strykerSettings(project)).toEqual([]);
    expect(testRunners({ project, roots: [], report: reporter(project, 'imports/alias-declared') })).toEqual([]);
  });

  it('reads no setting of a Stryker config that cannot be read', () => {
    const root = projectWith({});

    fs.mkdirSync(path.join(root, 'stryker.conf.json'));

    expect(strykerSettings(loadProject(root))).toEqual([]);
  });

  it('reads an empty raw config from a config text that is not JSON', () => {
    expect(rawConfig(nowhere('{'))).toEqual({});
  });

  it('places an unknown key on line 1 when the text does not hold it as written', () => {
    const violations = unknownKeys({ bogus: 1 }, '{}', reporter(nowhere(), 'config/valid'));

    expect(violations.map(({ file, line, message }) => [file, line, message])).toEqual([
      [CONFIG_FILE, 1, `"bogus" is not a key of ${CONFIG_FILE}: nothing reads it.`],
    ]);
  });

  it('knows no decision record where docs/adr/ does not exist', () => {
    expect(new DecisionRecords(NOWHERE).has(1)).toBe(false);
  });

  it('reads no drizzle migrations from a journal that is not JSON', () => {
    const root = tempDir('drizzle-journal');

    write(root, 'migrations/meta/_journal.json', '{');

    expect(readDrizzleMigrations(root)).toBeUndefined();
  });

  it.skipIf(process.getuid?.() === 0)('lists no migration file of a folder that cannot be listed', () => {
    const root = tempDir('drizzle-unlistable');
    const folder = path.join(root, 'migrations');

    write(root, 'migrations/meta/_journal.json', JSON.stringify({ entries: [] }));
    fs.chmodSync(folder, 0o311);

    try {
      expect(readDrizzleMigrations(root)?.files).toEqual([]);
    } finally {
      fs.chmodSync(folder, 0o755);
    }
  });

  it('loads the sources of loose directories, their folders and other files left aside', () => {
    const root = tempDir('loose');

    write(root, 'src/nested/a.ts', 'export const a = 1;\n');
    write(root, 'src/readme.md', '# a\n');

    expect(loadLooseProject(root, ['src']).files.map(({ path: file }) => file)).toEqual(['src/nested/a.ts']);
  });

  it('keeps on an import what the scanner read of it: its kind and whether it is of types only', () => {
    const service = 'src/contexts/billing/domain/services/dunning.service.ts';

    const source = [
      "import type { Invoice } from '@/contexts/billing/domain/aggregates/invoice.aggregate';",
      "export { Money } from '@/shared-kernel/money.vo';",
      "const late = await import('@/contexts/billing/domain/services/late.service');",
    ].join('\n');

    const [file] = loadProject(projectWith({ [service]: source })).files;

    expect(file?.imports).toMatchObject([
      { kind: 'import', typeOnly: true, line: 1, names: ['Invoice'] },
      { kind: 'export', typeOnly: false, line: 2 },
      { kind: 'dynamic', typeOnly: false, line: 3 },
    ]);
  });

  it('reports no suppression without a reason when the rule is off', () => {
    const bare = { 'src/platform/clock.ts': '// ddd-ts-kit-disable-next-line\nexport const clock = 1;\n' };
    const form = { rules: ['config/suppression-needs-reason'] };

    expect(runCheck(loadProject(projectWith(bare)), form).violations).toMatchObject([
      { line: 1, message: 'A suppression names no rule.' },
    ]);

    const off = projectWith(bare, { rules: { 'config/suppression-needs-reason': 'off' } });

    expect(runCheck(loadProject(off), form).violations).toEqual([]);
  });

  it('cannot read the grants of an authorizer built without options, or without a grants property', () => {
    const file = 'src/platform/auth/authorization/create-authorizer.ts';

    const project = loadProject(
      projectWith({
        [file]: [
          'export const bare = new SignedInGrantsAuthorizer();',
          'export const wrapped = new SignedInGrantsAuthorizer({ otherwise: model });',
          '',
        ].join('\n'),
      }),
    );

    const { lists, unread } = signedInGrantSources(project);

    expect(lists).toEqual([]);

    expect(unread.map(({ file: source, line }) => [source.path, line])).toEqual([
      [file, 1],
      [file, 2],
    ]);
  });
});

describe('the baseline of the checks', () => {
  it('is written with its files and rules sorted', () => {
    const text = baselineText({
      'b.ts': { 'rule/z': { count: 1 }, 'rule/a': { count: 2 } },
      'a.ts': { 'rule/x': { count: 3 } },
    });

    expect(text.replace(/\s/g, '')).toBe(
      '{"a.ts":{"rule/x":{"count":3}},"b.ts":{"rule/a":{"count":2},"rule/z":{"count":1}}}',
    );
  });

  it('is refused when a count is not a positive integer', () => {
    expect(() => parseBaseline('{"a.ts":{"rule/x":{"count":0}}}')).toThrow(/is not a baseline/);
  });
});

describe('the explanation of a rule', () => {
  it('is a bug of the kit when a rule has none', () => {
    expect(() => documentedRule('nope/rule')).toThrow(/has no explanation/);
    expect(() => delegatedDoc('nope/rule')).toThrow(/has no explanation/);
  });

  it('names the tool that checks a delegated rule', () => {
    const [delegated] = DELEGATED_RULES;

    if (delegated === undefined) {
      throw new Error('no rule is delegated');
    }

    const violation = { ruleId: delegated.id, severity: 'error' as const, file: 'x.ts', line: 1, message: '', fix: '' };

    expect(explanationsOf([violation, violation])).toEqual([
      { id: delegated.id, description: delegated.description, why: delegated.where, checkedBy: delegated.checkedBy },
    ]);
  });
});
