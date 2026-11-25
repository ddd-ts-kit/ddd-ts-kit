import fs from 'node:fs';
import path from 'node:path';
import { type ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../../eslint-plugin/src';
import { PURITY_TABLES } from '../src/check/purity/reference/purity-tables';
import { runCheck } from '../src/check/engine/run-check';
import { loadProject } from '../src/check/project/load-project';
import { REPO_ROOT } from './helpers';
import { projectWith } from './rules-support';
import { PURITY_TWIN_CASES, type PurityTwinCase } from './support/purity-twin-cases';
import { PURITY_TWIN_DIFFERENCES } from './support/purity-twin-differences';

const RULE_IDS = Object.keys(PURITY_TABLES);

const FILES = {
  domain: 'src/contexts/billing/domain/services/probe.ts',
  application: 'src/contexts/billing/application/commands/probe/probe.handler.ts',
};

const CONTEXTS = { billing: { classification: 'core', upstreams: [] } };

/** One finding as both analyzers word it: the rule, the line, and the whole sentence with its fix. */
interface Verdict {
  readonly found: string;
  readonly said: string;
}

type Judged = Pick<PurityTwinCase, 'layer' | 'source'>;

/**
 * The three purity/* rules have two analyzers fed by one table: this spec runs the same sources
 * through both and holds them to the same rules, on the same lines, in the same words.
 */
describe('the purity rules of the checker and of the ESLint plugin', () => {
  it('read one reference: each package holds its copy, file for file, since neither depends on the other', () => {
    const inTheChecker = referenceIn('packages/cli/src/check/purity/reference');

    expect(Object.keys(inTheChecker)).toContain('purity-tables.ts');
    expect(referenceIn('packages/eslint-plugin/src/support/purity/reference')).toEqual(inTheChecker);
  });

  it.each(PURITY_TWIN_CASES.map((entry) => [entry.what, entry] as const))('agree on %s', (_what, entry) => {
    const checker = byTheChecker(entry);

    expect(checker.map(({ found }) => found)).toEqual(entry.found);
    expect(byThePlugin(entry)).toEqual(checker);
  });

  it.each(PURITY_TWIN_DIFFERENCES.map((entry) => [entry.what, entry] as const))('differ on %s', (_what, entry) => {
    expect(byTheChecker(entry).map(({ found }) => found)).toEqual(entry.checker);
    expect(byThePlugin(entry).map(({ found }) => found)).toEqual(entry.eslint);
  });
});

/** The files of a folder of the repository, by name. */
function referenceIn(folder: string): Record<string, string> {
  const files = fs.readdirSync(path.join(REPO_ROOT, folder)).sort();

  return Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(REPO_ROOT, folder, file), 'utf8')]));
}

function byTheChecker({ layer, source }: Judged): Verdict[] {
  const root = projectWith({ [FILES[layer]]: `${source.join('\n')}\n` });
  const { violations } = runCheck(loadProject(root), { rules: RULE_IDS });

  return inOrder(
    violations.map(({ ruleId, line, message, fix }) => ({ found: `${ruleId}:${line}`, said: `${message} ${fix}` })),
  );
}

function byThePlugin({ layer, source }: Judged): Verdict[] {
  const found = new Linter({ configType: 'flat' }).verify(
    source.join('\n'),
    {
      files: ['**/*.ts'],
      plugins: { 'ddd-ts-kit': plugin as ESLint.Plugin },
      languageOptions: { parser: tseslint.parser },
      settings: { 'ddd-ts-kit': { config: { contexts: CONTEXTS }, filename: FILES[layer] } },
      rules: Object.fromEntries(RULE_IDS.map((id) => [`ddd-ts-kit/${id.replace('/', '-')}`, 'error'])),
    },
    { filename: 'sample.ts' },
  );

  return inOrder(
    found.map(({ ruleId, line, message }) => ({
      found: `${(ruleId ?? 'a parsing error').replace('ddd-ts-kit/purity-', 'purity/')}:${line}`,
      said: message,
    })),
  );
}

function inOrder(verdicts: readonly Verdict[]): Verdict[] {
  const line = ({ found }: Verdict): number => Number(found.slice(found.lastIndexOf(':') + 1));

  return [...verdicts].sort((left, right) => line(left) - line(right) || left.said.localeCompare(right.said));
}
